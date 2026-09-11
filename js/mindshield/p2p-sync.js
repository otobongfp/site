/**
 * Mind Shield - P2P Sync & Data Transfer Layer
 * Supports:
 * 1. 1-Click JSON Backup & Import (AirDrop / Local file)
 * 2. Instant QR Snapshot (Scan to load tasks immediately on mobile)
 * 3. WebRTC Peer-to-Peer Direct Connection via QR handshake
 */

import { backupRepo } from './repositories.js';

export const p2pSync = {
  peerConnection: null,
  dataChannel: null,

  // 1. Export JSON File
  async downloadBackupFile() {
    const backup = await backupRepo.exportData();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mind-shield-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // 2. Import JSON File
  async importBackupFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const payload = JSON.parse(e.target.result);
          await backupRepo.importData(payload);
          resolve(true);
        } catch (err) {
          reject(new Error('Failed to parse backup file: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read backup file'));
      reader.readAsText(file);
    });
  },

  // 3. Compact QR Snapshot generation
  async generateQRSnapshot(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    const backup = await backupRepo.exportData();
    // Compact representation
    const compactData = {
      v: 1,
      t: Date.now(),
      p: backup.data.projects.map(p => ({ id: p.id, n: p.name, a: p.archived ? 1 : 0 })),
      tk: backup.data.tasks.map(t => ({
        id: t.id,
        pId: t.projectId,
        t: t.title,
        pr: t.priority,
        u: t.urgency,
        sq: t.sequence,
        st: t.status,
        na: t.nextAction || '',
        sr: t.stoppedReason || ''
      })),
      th: backup.data.thoughts.filter(th => !th.resolved).map(th => ({ id: th.id, txt: th.text }))
    };

    const payloadString = 'MS1:' + btoa(unescape(encodeURIComponent(JSON.stringify(compactData))));

    if (window.QRCode) {
      new window.QRCode(containerEl, {
        text: payloadString,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } else {
      containerEl.innerHTML = `<textarea readonly style="width:100%;height:140px;font-size:11px;background:#0d0d11;color:#7fffd4;border:1px solid #333;padding:8px;border-radius:6px;">${payloadString}</textarea>`;
    }
  },

  // 4. Import from Compact QR string
  async importFromQRString(str) {
    if (!str || !str.startsWith('MS1:')) {
      throw new Error('Invalid QR snapshot code format');
    }

    try {
      const b64 = str.slice(4);
      const jsonStr = decodeURIComponent(escape(atob(b64)));
      const compact = JSON.parse(jsonStr);

      const projects = (compact.p || []).map(p => ({
        id: p.id,
        name: p.n,
        archived: p.a === 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      const tasks = (compact.tk || []).map(t => ({
        id: t.id,
        projectId: t.pId,
        title: t.t,
        priority: t.pr || 'P1',
        urgency: t.u || 'TODAY',
        sequence: t.sq || 1,
        status: t.st || 'NEXT',
        nextAction: t.na || '',
        stoppedReason: t.sr || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null
      }));

      const thoughts = (compact.th || []).map(th => ({
        id: th.id,
        text: th.txt,
        createdAt: new Date().toISOString(),
        resolved: false
      }));

      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          projects,
          tasks,
          focusSessions: [],
          thoughts
        }
      };

      await backupRepo.mergeRemoteData(payload);
      return true;
    } catch (err) {
      throw new Error('Failed to import snapshot: ' + err.message);
    }
  },

  // 5. Direct WebRTC P2P Session Initializer
  async createOffer(onSignalReady, onStatusChange) {
    this.close();

    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    this.peerConnection = new RTCPeerConnection(config);
    this.dataChannel = this.peerConnection.createDataChannel('mindShieldSync');

    this._setupDataChannel(onStatusChange);

    this.peerConnection.onicecandidate = (event) => {
      if (!event.candidate && this.peerConnection.localDescription) {
        // ICE gathering finished, localDescription has full SDP
        const offerSignal = btoa(JSON.stringify(this.peerConnection.localDescription));
        onSignalReady(offerSignal);
      }
    };

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
  },

  async handleAnswer(answerBase64, onStatusChange) {
    if (!this.peerConnection) throw new Error('No active peer connection');
    const answerSdp = JSON.parse(atob(answerBase64));
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
  },

  async joinSession(offerBase64, onSignalReady, onStatusChange) {
    this.close();

    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    this.peerConnection = new RTCPeerConnection(config);

    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this._setupDataChannel(onStatusChange);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (!event.candidate && this.peerConnection.localDescription) {
        const answerSignal = btoa(JSON.stringify(this.peerConnection.localDescription));
        onSignalReady(answerSignal);
      }
    };

    const offerSdp = JSON.parse(atob(offerBase64));
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
  },

  _setupDataChannel(onStatusChange) {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = async () => {
      if (onStatusChange) onStatusChange('connected');
      // Send local data
      const backup = await backupRepo.exportData();
      this.dataChannel.send(JSON.stringify({ type: 'SYNC_INIT', payload: backup }));
    };

    this.dataChannel.onclose = () => {
      if (onStatusChange) onStatusChange('disconnected');
    };

    this.dataChannel.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SYNC_INIT') {
          // Merge peer's data
          await backupRepo.mergeRemoteData(msg.payload);
          // Send back merged local state for full 2-way sync
          const localBackup = await backupRepo.exportData();
          this.dataChannel.send(JSON.stringify({ type: 'SYNC_REPLY', payload: localBackup }));
          if (onStatusChange) onStatusChange('sync_success');
        } else if (msg.type === 'SYNC_REPLY') {
          await backupRepo.mergeRemoteData(msg.payload);
          if (onStatusChange) onStatusChange('sync_success');
        }
      } catch (e) {
        console.error('P2P Message error:', e);
      }
    };
  },

  close() {
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch (e) {}
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (e) {}
      this.peerConnection = null;
    }
  }
};
