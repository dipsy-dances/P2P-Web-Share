const LOG = (...args) => console.log('[WebRTC]', ...args);
const ERR = (...args) => console.error('[WebRTC]', ...args);

export default class WebRTCManager extends EventTarget {
  constructor(socket, peerId, isInitiator, config = {}) {
    super();
    this.socket = socket;
    this.peerId = peerId;
    this.isInitiator = isInitiator;
    this.iceServers = config.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    this.iceCandidateBuffer = [];
    this.remoteDescriptionSet = false;

    LOG('constructor: peerId=%s isInitiator=%s', peerId, isInitiator);

    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        LOG('onicecandidate: sending candidate to %s', this.peerId);
        this.socket.emit('signal', {
          to: this.peerId,
          signal: { type: 'ice-candidate', data: event.candidate.toJSON() }
        });
      } else {
        LOG('onicecandidate: end of candidates for %s', this.peerId);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      LOG('iceConnectionState: %s (peer=%s)', this.pc.iceConnectionState, this.peerId);
    };

    this.pc.onconnectionstatechange = () => {
      LOG('connectionState: %s (peer=%s)', this.pc.connectionState, this.peerId);
      this.dispatchEvent(new CustomEvent('state-change', { detail: this.pc.connectionState }));
      if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
        this.dispatchEvent(new Event('disconnected'));
      }
    };

    this.pc.onsignalingstatechange = () => {
      LOG('signalingState: %s (peer=%s)', this.pc.signalingState, this.peerId);
    };

    if (this.isInitiator) {
      LOG('constructor: creating DataChannels as initiator');
      this.dataChannel = this.pc.createDataChannel('file-data', { ordered: true });
      this.dataChannel.binaryType = 'arraybuffer';
      this.setupDataChannel(this.dataChannel);

      this.controlChannel = this.pc.createDataChannel('control');
      this.setupControlChannel(this.controlChannel);
    } else {
      LOG('constructor: waiting for DataChannels as responder');
      this.pc.ondatachannel = (event) => {
        LOG('ondatachannel: received channel "%s"', event.channel.label);
        if (event.channel.label === 'file-data') {
          this.dataChannel = event.channel;
          this.dataChannel.binaryType = 'arraybuffer';
          this.setupDataChannel(this.dataChannel);
        } else if (event.channel.label === 'control') {
          this.controlChannel = event.channel;
          this.setupControlChannel(this.controlChannel);
        }
      };
    }
  }

  setupDataChannel(channel) {
    channel.onmessage = (event) => {
      this.dispatchEvent(new CustomEvent('data', { detail: event.data }));
    };
    channel.onopen = () => {
      LOG('dataChannel OPEN (peer=%s)', this.peerId);
      this.checkBothChannelsOpen();
    };
    channel.onerror = (e) => {
      ERR('dataChannel error (peer=%s):', this.peerId, e);
    };
    if (channel.readyState === 'open') {
      LOG('dataChannel already open on setup (peer=%s)', this.peerId);
      this.checkBothChannelsOpen();
    }
  }

  setupControlChannel(channel) {
    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.dispatchEvent(new CustomEvent('control', { detail: msg }));
      } catch (err) {
        ERR('Failed to parse control message (peer=%s):', this.peerId, err);
      }
    };
    channel.onopen = () => {
      LOG('controlChannel OPEN (peer=%s)', this.peerId);
      this.checkBothChannelsOpen();
    };
    channel.onerror = (e) => {
      ERR('controlChannel error (peer=%s):', this.peerId, e);
    };
    if (channel.readyState === 'open') {
      LOG('controlChannel already open on setup (peer=%s)', this.peerId);
      this.checkBothChannelsOpen();
    }
  }

  checkBothChannelsOpen() {
    const dataOpen = this.dataChannel?.readyState === 'open';
    const controlOpen = this.controlChannel?.readyState === 'open';
    LOG('checkBothChannelsOpen: data=%s control=%s (peer=%s)', dataOpen, controlOpen, this.peerId);
    if (dataOpen && controlOpen) {
      if (!this._connectedEmitted) {
        this._connectedEmitted = true;
        LOG('BOTH CHANNELS OPEN — emitting connected (peer=%s)', this.peerId);
        this.dispatchEvent(new Event('connected'));
      }
    }
  }

  async createOffer() {
    LOG('createOffer: creating for peer=%s', this.peerId);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    LOG('createOffer: localDescription set, sending offer to %s', this.peerId);
    this.socket.emit('signal', {
      to: this.peerId,
      signal: { type: 'offer', data: this.pc.localDescription.toJSON() }
    });
  }

  async handleOffer(offer) {
    LOG('handleOffer: setting remoteDescription from %s', this.peerId);
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescriptionSet = true;
    this.processIceCandidateBuffer();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    LOG('handleOffer: sending answer to %s', this.peerId);
    this.socket.emit('signal', {
      to: this.peerId,
      signal: { type: 'answer', data: this.pc.localDescription.toJSON() }
    });
  }

  async handleAnswer(answer) {
    LOG('handleAnswer: setting remoteDescription from %s', this.peerId);
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.remoteDescriptionSet = true;
    this.processIceCandidateBuffer();
  }

  handleIceCandidate(candidate) {
    LOG('handleIceCandidate: from %s, remoteDescSet=%s', this.peerId, this.remoteDescriptionSet);
    try {
      if (this.remoteDescriptionSet) {
        // Pass the plain object directly — modern browsers handle it fine
        this.pc.addIceCandidate(candidate).catch(e =>
          ERR('Error adding ICE candidate (peer=%s):', this.peerId, e)
        );
      } else {
        LOG('handleIceCandidate: buffering (peer=%s)', this.peerId);
        this.iceCandidateBuffer.push(candidate);
      }
    } catch (e) {
      ERR('handleIceCandidate threw (peer=%s):', this.peerId, e);
    }
  }

  processIceCandidateBuffer() {
    if (this.iceCandidateBuffer.length > 0) {
      LOG('processIceCandidateBuffer: flushing %d candidates (peer=%s)', this.iceCandidateBuffer.length, this.peerId);
    }
    for (const candidate of this.iceCandidateBuffer) {
      this.pc.addIceCandidate(candidate).catch(e =>
        ERR('Error adding buffered ICE candidate (peer=%s):', this.peerId, e)
      );
    }
    this.iceCandidateBuffer = [];
  }

  async sendChunk(chunkData) {
    return new Promise((resolve, reject) => {
      if (this.dataChannel.readyState !== 'open') {
        return reject(new Error('DataChannel not open'));
      }

      const HIGH_WATER_MARK = 256 * 1024;
      this.dataChannel.bufferedAmountLowThreshold = 64 * 1024;

      if (this.dataChannel.bufferedAmount > HIGH_WATER_MARK) {
        const onLow = () => {
          this.dataChannel.removeEventListener('bufferedamountlow', onLow);
          try {
            this.dataChannel.send(chunkData);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        this.dataChannel.addEventListener('bufferedamountlow', onLow);
      } else {
        try {
          this.dataChannel.send(chunkData);
          resolve();
        } catch (err) {
          reject(err);
        }
      }
    });
  }

  async awaitDrain() {
    return new Promise((resolve) => {
      if (!this.dataChannel || this.dataChannel.readyState !== 'open' || this.dataChannel.bufferedAmount === 0) {
        resolve();
        return;
      }
      const interval = setInterval(() => {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open' || this.dataChannel.bufferedAmount === 0) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }

  sendControl(message) {
    if (this.controlChannel?.readyState === 'open') {
      this.controlChannel.send(JSON.stringify(message));
    } else {
      ERR('sendControl: controlChannel not open (peer=%s, state=%s)', this.peerId, this.controlChannel?.readyState);
    }
  }

  async restartIce() {
    LOG('restartIce: peer=%s', this.peerId);
    const offer = await this.pc.createOffer({ iceRestart: true });
    await this.pc.setLocalDescription(offer);
    this.socket.emit('signal', {
      to: this.peerId,
      signal: { type: 'offer', data: this.pc.localDescription.toJSON() }
    });
  }

  close() {
    LOG('close: peer=%s', this.peerId);
    this.dataChannel?.close();
    this.controlChannel?.close();
    this.pc.close();
  }
}
