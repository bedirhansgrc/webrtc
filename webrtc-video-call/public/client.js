document.addEventListener('DOMContentLoaded', () => {

    const joinSound = new Audio('/sounds/join.mp3');
    const dcSound = new Audio('/sounds/dc.mp3');
    const messageSound = new Audio('/sounds/message.mp3');
    const muteSound = new Audio('/sounds/mute.mp3');
    const unmuteSound = new Audio('/sounds/unmute.mp3');

    joinSound.load();
    dcSound.load();
    messageSound.load();
    muteSound.load();
    unmuteSound.load();

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
    const toggleVideoButton = document.getElementById('toggle-video-button');
    const toggleAudioButton = document.getElementById('toggle-audio-button');
    const shareScreenButton = document.getElementById('share-screen-button');
    const leaveRoomButton = document.getElementById('leave-room-button');

    // File transfer elements
    const uploadInput = document.getElementById('upload-input');
    const uploadButton = document.getElementById('upload-button');
    const progressContainer = document.getElementById('progress-container');
    const uploadProgress = document.getElementById('upload-progress');
    const progressPercent = document.getElementById('progress-percent');

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
    let screenSharingStream;
    let isScreenSharing = false;

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
        showDisconnectImage();
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
        messageSound.play();
    });

    socket.on('user_joined', (username) => {
        console.log(`User ${username} joined`);
        showNotification(`${username} joined`);
        hideDisconnectImage();
        joinSound.play();
    });

    socket.on('user_disconnected', (username) => {
        console.log(`${username} disconnected`);
        showNotification(`${username} disconnected`);
        showDisconnectImage();
        dcSound.play();
        if (rtcPeerConnection) {
            rtcPeerConnection.close();
            rtcPeerConnection = null;
        }
    });

    socket.on('file_uploaded', (data) => {
        const messageElement = document.createElement('p');
        const downloadLinkElement = document.createElement('a');
        downloadLinkElement.href = data.downloadLink;
        downloadLinkElement.textContent = `Download ${data.fileName}`;
        downloadLinkElement.setAttribute('download', data.fileName);

        messageElement.appendChild(downloadLinkElement);
        messages.appendChild(messageElement);
        messageSound.play();
    });

    function showDisconnectImage() {
        remoteVideoComponent.srcObject = null;
        remoteVideoComponent.src = '/disconnect.jpg';
    }

    function hideDisconnectImage() {
        remoteVideoComponent.src = '';
    }

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
            socket.emit('join', { roomId, username });
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

    // Notification function
    function showNotification(message) {
        const notificationElement = document.createElement('div');
        notificationElement.textContent = message;
        notificationElement.className = 'notification';
        document.body.appendChild(notificationElement);

        setTimeout(() => {
            notificationElement.classList.add('show');
        }, 100);

        setTimeout(() => {
            notificationElement.classList.remove('show');
            setTimeout(() => {
                notificationElement.remove();
            }, 500);
        }, 5000);
    }

    // File transfer events
    uploadButton.addEventListener('click', () => {
        const file = uploadInput.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);


            progressContainer.style.display = 'flex';

            fetch(`/upload`, {
                method: 'POST',
                body: formData
            }).then(response => response.json())
                .then(data => {
                    showNotification('File uploaded successfully');
                    progressContainer.style.display = 'none';
                    uploadProgress.value = 0;
                    progressPercent.textContent = '0%';
                }).catch(error => {
                    console.error('Error uploading file:', error);
                    showNotification('File upload failed');
                    progressContainer.style.display = 'none';
                    uploadProgress.value = 0;
                    progressPercent.textContent = '0%';
                });
        } else {
            showNotification('Please select a file to upload');
        }
    });

    toggleVideoButton.addEventListener('click', () => {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        toggleVideoButton.textContent = videoTrack.enabled ? 'Turn Off Video' : 'Turn On Video';
    });

    toggleAudioButton.addEventListener('click', () => {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudioButton.textContent = audioTrack.enabled ? 'Turn Off Audio' : 'Turn On Audio';

        if (audioTrack.enabled) {
            unmuteSound.play();
        } else {
            muteSound.play();
        }
    });

    shareScreenButton.addEventListener('click', async () => {
        if (!isScreenSharing) {
            try {
                screenSharingStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenSharingStream.getVideoTracks()[0];

                screenTrack.onended = () => {
                    stopScreenSharing();
                };

                const videoSender = rtcPeerConnection.getSenders().find(sender => sender.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(screenTrack);
                }

                localVideoComponent.srcObject = screenSharingStream;

                isScreenSharing = true;
                shareScreenButton.textContent = 'Stop Sharing';
            } catch (error) {
                console.error('Error sharing screen:', error);
            }
        } else {
            stopScreenSharing();
        }
    });

    leaveRoomButton.addEventListener('click', () => {
        leaveRoom();
    });

    function leaveRoom() {
        if (rtcPeerConnection) {
            rtcPeerConnection.close();
            rtcPeerConnection = null;
        }
        socket.emit('leave_room', { roomId, username });
        socket.disconnect();
        hideVideoConference();
        roomId = null;
    }

    function hideVideoConference() {
        videoChatContainer.style.display = 'none';
        roomSelectionContainer.style.display = 'flex';
    }
    
    function stopScreenSharing() {
        if (!isScreenSharing) return;

        const videoTrack = localStream.getVideoTracks()[0];
        const videoSender = rtcPeerConnection.getSenders().find(sender => sender.track.kind === 'video');
        if (videoSender) {
            videoSender.replaceTrack(videoTrack);
        }

        localVideoComponent.srcObject = localStream;
        screenSharingStream.getTracks().forEach(track => track.stop());

        isScreenSharing = false;
        shareScreenButton.textContent = 'Share Screen';
    }

    function updateProgress(event) {
        if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            uploadProgress.value = percentComplete;
            progressPercent.textContent = `${percentComplete}%`;
        }
    }

    uploadInput.addEventListener('change', () => {
        const file = uploadInput.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true);

            xhr.upload.addEventListener('progress', updateProgress);

            xhr.onload = () => {
                if (xhr.status === 200) {
                    showNotification('File uploaded successfully');
                } else {
                    showNotification('File upload failed');
                }
                progressContainer.style.display = 'none';
                uploadProgress.value = 0;
                progressPercent.textContent = '0%';
            };

            xhr.onerror = () => {
                showNotification('File upload failed');
                progressContainer.style.display = 'none';
                uploadProgress.value = 0;
                progressPercent.textContent = '0%';
            };

            progressContainer.style.display = 'flex';
            xhr.send(formData);
        }
    });
});
