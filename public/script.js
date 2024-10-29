const socket = io.connect('/');
let localStream;
const peerConnections = {};  // Track all peer connections by userId
const iceCandidateQueue = {};  // Queue ICE candidates for each userId

// Get local video and audio
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        document.getElementById('localVideo').srcObject = stream;
        localStream = stream;
        socket.emit('join-room', 'conference-room');  // Join a specific room
    })
    .catch(error => console.error('Error accessing media devices.', error));

// Handle a new user joining
socket.on('user-joined', userId => {
    // Create a new peer connection for this user if it doesn’t already exist
    const peerConnection = createPeerConnection(userId);
    peerConnections[userId] = peerConnection;

    // Create and send an offer to the new user
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => socket.emit('offer', peerConnection.localDescription, userId))
        .catch(error => console.error("Error creating an offer:", error));
});

// Handle incoming ICE candidates
socket.on('ice-candidate', (candidate, userId) => {
    // Ensure the peer connection exists or queue the candidate if not ready
    const peerConnection = peerConnections[userId];
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => console.error("Error adding received ICE candidate:", error));
    } else {
        if (!iceCandidateQueue[userId]) {
            iceCandidateQueue[userId] = [];  // Initialize queue for this userId
        }
        iceCandidateQueue[userId].push(candidate);  // Queue the candidate
        console.warn(`Peer connection for user ${userId} not ready; queuing candidate.`);
    }
});

// Process queued ICE candidates once the peer connection is ready
function processIceCandidates(userId) {
    if (iceCandidateQueue[userId] && peerConnections[userId]) {
        iceCandidateQueue[userId].forEach(candidate => {
            peerConnections[userId].addIceCandidate(new RTCIceCandidate(candidate))
                .catch(error => console.error("Error adding queued ICE candidate:", error));
        });
        iceCandidateQueue[userId] = [];  // Clear the queue after processing
    }
}

// Create a new peer connection and set up event handlers
function createPeerConnection(userId) {
    if (peerConnections[userId]) {
        return peerConnections[userId];  // Return existing connection if already created
    }

    const peerConnection = new RTCPeerConnection();

    // Add all tracks of the local stream to the peer connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Handle the remote stream from each peer
    peerConnection.ontrack = event => {
        const remoteVideo = document.createElement('video');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.id = `video-${userId}`;  // Set a unique ID for each video
        document.getElementById('remoteVideos').appendChild(remoteVideo);
    };

    // Handle ICE candidates from each peer
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate, userId);
        }
    };

    // Process any ICE candidates that were queued before this connection was ready
    processIceCandidates(userId);

    return peerConnection;
}

// Remove video element and close peer connection when a user disconnects
socket.on('user-left', userId => {
    const videoElement = document.getElementById(`video-${userId}`);
    if (videoElement) {
        videoElement.remove();
    }
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    if (iceCandidateQueue[userId]) {
        delete iceCandidateQueue[userId];  // Clear queued candidates for this user
    }
});
