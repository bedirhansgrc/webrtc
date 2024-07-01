document.addEventListener('DOMContentLoaded', () => {
    const roomSelectionContainer = document.getElementById('room-selection-container');
    const usernameInput = document.getElementById('username-input');
    const roomInput = document.getElementById('room-input');
    const connectButton = document.getElementById('connect-button');

    const videoChatContainer = document.getElementById('video-chat-container');
    const localVideoComponent = document.getElementById('local-video');
    const remoteVideoComponent = document.getElementById('remote-video');

    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messages = document.getElementById('messages');

    // File transfer elements
    const uploadInput = document.getElementById('upload-input');
    const uploadButton = document.getElementById('upload-button');

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
    let username;

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
        username = usernameInput.value.trim();
        if (!username) {
            alert('Please enter a username');
            return;
        }
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

    socket.on('message', (data) => {
        console.log(`Received message: ${data.message} from ${data.sender}`);
        displayMessage(data);
    });

    socket.on('user_disconnected', () => {
        console.log('User disconnected');
        remoteVideoComponent.src = '/disconnect.jpg';
        if (rtcPeerConnection) {
            rtcPeerConnection.close();
            rtcPeerConnection = null;
        }
    });

    sendButton.addEventListener('click', () => {
        sendMessage();
    });

    messageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

    function sendMessage() {
        const message = messageInput.value;
        if (message.trim() === '') return;

        const data = {
            roomId,
            message,
            sender: username
        };

        console.log(`Sending message: ${message} from ${username}`);
        socket.emit('message', data);
        displayMessage(data);
        messageInput.value = '';
    }

    function displayMessage(data) {
        const messageElement = document.createElement('p');
        messageElement.textContent = `${data.sender}: ${data.message}`;
        messages.appendChild(messageElement);
    }

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
        videoChatContainer.style.display = 'flex';
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

    // File transfer events
    uploadButton.addEventListener('click', () => {
        const file = uploadInput.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);

            fetch(`/upload`, {
                method: 'POST',
                body: formData
            }).then(response => response.json())
            .then(data => {
                alert('File uploaded successfully');
            }).catch(error => {
                console.error('Error uploading file:', error);
                alert('File upload failed');
            });
        } else {
            alert('Please select a file to upload');
        }
    });

    // Dosya yüklendiğinde gelen mesajı görüntüleyin
    socket.on('file_uploaded', (data) => {
        const messageElement = document.createElement('p');
        const downloadLinkElement = document.createElement('a');
        downloadLinkElement.href = data.downloadLink;
        downloadLinkElement.textContent = `Download ${data.fileName}`;
        downloadLinkElement.setAttribute('download', data.fileName);
        
        messageElement.appendChild(downloadLinkElement);
        messages.appendChild(messageElement);
    });
});
