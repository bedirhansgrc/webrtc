document.addEventListener('DOMContentLoaded', () => {
    const roomSelectionContainer = document.getElementById('room-selection-container');
    const roomInput = document.getElementById('room-input');
    const connectButton = document.getElementById('connect-button');
  
    const videoChatContainer = document.getElementById('video-chat-container');
    const localVideoComponent = document.getElementById('local-video');
    const remoteVideoComponent = document.getElementById('remote-video');
  
    const socket = io();
    const mediaConstraints = {
      audio: true,
      video: { width: 1280, height: 720 },
    };
    let localStream;
    let remoteStream;
    let isRoomCreator = false;
    let rtcPeerConnection;
    let roomId;
  
    const iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
    };
  
    connectButton.addEventListener('click', () => {
      joinRoom(roomInput.value);
    });
  
    socket.on('room_created', async () => {
      console.log('Socket event callback: room_created');
      await setLocalStream(mediaConstraints);
      isRoomCreator = true;
    });
  
    socket.on('room_joined', async () => {
      console.log('Socket event callback: room_joined');
      await setLocalStream(mediaConstraints);
      socket.emit('start_call', roomId);
    });
  
    socket.on('full_room', () => {
      console.log('Socket event callback: full_room');
      alert('The room is full, please try another one');
    });
  
    socket.on('start_call', async () => {
      console.log('Socket event callback: start_call');
      if (isRoomCreator) {
        rtcPeerConnection = new RTCPeerConnection(iceServers);
        addLocalTracks(rtcPeerConnection);
        rtcPeerConnection.ontrack = setRemoteStream;
        rtcPeerConnection.onicecandidate = sendIceCandidate;
  
        const offer = await rtcPeerConnection.createOffer();
        await rtcPeerConnection.setLocalDescription(offer);
        socket.emit('webrtc_offer', { type: 'webrtc_offer', sdp: offer, roomId });
        console.log('webrtc_offer sent');
      }
    });
  
    socket.on('webrtc_offer', async (event) => {
      console.log('Socket event callback: webrtc_offer');
      if (!isRoomCreator) {
        rtcPeerConnection = new RTCPeerConnection(iceServers);
        addLocalTracks(rtcPeerConnection);
        rtcPeerConnection.ontrack = setRemoteStream;
        rtcPeerConnection.onicecandidate = sendIceCandidate;
  
        await rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
        const answer = await rtcPeerConnection.createAnswer();
        await rtcPeerConnection.setLocalDescription(answer);
        socket.emit('webrtc_answer', { type: 'webrtc_answer', sdp: answer, roomId });
        console.log('webrtc_answer sent');
      }
    });
  
    socket.on('webrtc_answer', (event) => {
      console.log('Socket event callback: webrtc_answer');
      rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
    });
  
    socket.on('webrtc_ice_candidate', (event) => {
      console.log('Socket event callback: webrtc_ice_candidate');
      const candidate = new RTCIceCandidate(event.candidate);
      rtcPeerConnection.addIceCandidate(candidate);
      console.log('ICE candidate added');
    });
  
    async function joinRoom(room) {
      if (room === '') {
        alert('Please type a room ID');
      } else {
        roomId = room;
        socket.emit('join', room);
        showVideoConference();
      }
    }
  
    function showVideoConference() {
      roomSelectionContainer.style.display = 'none';
      videoChatContainer.style.display = 'block';
    }
  
    async function setLocalStream(mediaConstraints) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localVideoComponent.srcObject = localStream;
      } catch (error) {
        console.error('Could not get user media', error);
      }
    }
  
    function addLocalTracks(rtcPeerConnection) {
      localStream.getTracks().forEach(track => {
        rtcPeerConnection.addTrack(track, localStream);
      });
    }
  
    function setRemoteStream(event) {
      remoteStream = event.streams[0];
      remoteVideoComponent.srcObject = remoteStream;
    }
  
    function sendIceCandidate(event) {
      if (event.candidate) {
        socket.emit('webrtc_ice_candidate', {
          type: 'webrtc_ice_candidate',
          candidate: event.candidate,
          roomId
        });
        console.log('ICE candidate sent');
      }
    }
  });
  