import React, { useEffect, useRef, useState } from "react";
import { Box, Flex, Text, Button, IconButton } from "@chakra-ui/react";
import { getSocket } from "../../socket";

// Using shared socket connection

const rtcConfig = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
};

const VideoCallRoom = ({ roomId, user, onClose }) => {
  const socketRef = useRef(null);
  const localVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]); // [{userId, stream}]
  const peersRef = useRef(new Map()); // userId -> RTCPeerConnection
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const attachStreamToVideo = (videoEl, stream) => {
    if (videoEl) {
      videoEl.srcObject = stream;
      try {
        // Ensure autoplay flags are set; browsers block unmuted autoplay
        videoEl.autoplay = true;
        // Respect existing muted attribute (remote videos may start muted)
        if (videoEl.hasAttribute && videoEl.hasAttribute("muted")) {
          videoEl.muted = true;
        }
      } catch (e) {}
      videoEl.play().catch(() => {});
    }
  };

  const addRemoteStream = (userId, stream) => {
    setRemoteStreams((prev) => {
      const exists = prev.find((s) => s.userId === userId);
      if (exists) return prev.map((s) => (s.userId === userId ? { userId, stream } : s));
      return [...prev, { userId, stream }];
    });
  };

  const removeRemoteStream = (userId) => {
    setRemoteStreams((prev) => prev.filter((s) => s.userId !== userId));
    const pc = peersRef.current.get(userId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
      peersRef.current.delete(userId);
    }
  };

  const createPeerConnection = (otherUserId) => {
    const pc = new RTCPeerConnection(rtcConfig);
    // Forward ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("call:ice", {
          roomId,
          fromUserId: user._id,
          toUserId: otherUserId,
          candidate: event.candidate,
        });
      }
    };
    // When remote track arrives
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) addRemoteStream(otherUserId, stream);
    };
    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }
    peersRef.current.set(otherUserId, pc);
    return pc;
  };

  const startOfferTo = async (otherUserId) => {
    if (!localStream) return; // Don't start if local stream isn't ready
    const pc = peersRef.current.get(otherUserId) || createPeerConnection(otherUserId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current.emit("call:offer", {
      roomId,
      fromUserId: user._id,
      toUserId: otherUserId,
      offer,
    });
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) return;
        setLocalStream(stream);
        attachStreamToVideo(localVideoRef.current, stream);
      } catch (e) {
        console.error("getUserMedia error", e);
      }

      socketRef.current = getSocket();
      socketRef.current.emit("call:join", { roomId, userId: user._id, name: user.name });

      socketRef.current.on("call:users-in-room", ({ users }) => {
        users.forEach((uid) => startOfferTo(uid));
      });

      socketRef.current.on("call:user-joined", ({ userId: newUserId }) => {
        startOfferTo(newUserId);
      });

      socketRef.current.on("call:offer", async ({ fromUserId, offer }) => {
        const pc = peersRef.current.get(fromUserId) || createPeerConnection(fromUserId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current.emit("call:answer", {
          roomId,
          fromUserId: user._id,
          toUserId: fromUserId,
          answer,
        });
      });

      socketRef.current.on("call:answer", async ({ fromUserId, answer }) => {
        const pc = peersRef.current.get(fromUserId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });

      socketRef.current.on("call:ice", async ({ fromUserId, candidate }) => {
        const pc = peersRef.current.get(fromUserId);
        if (pc && candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("Error adding ICE candidate", e);
          }
        }
      });

      socketRef.current.on("call:user-left", ({ userId: leftUserId }) => {
        removeRemoteStream(leftUserId);
      });
    };
    init();

    return () => {
      mounted = false;
      try {
        if (socketRef.current) {
          socketRef.current.emit("call:leave", { roomId, userId: user._id });
          socketRef.current.off("call:users-in-room");
          socketRef.current.off("call:user-joined");
          socketRef.current.off("call:offer");
          socketRef.current.off("call:answer");
          socketRef.current.off("call:ice");
          socketRef.current.off("call:user-left");
        }
        peersRef.current.forEach((pc) => pc.close());
        peersRef.current.clear();
        if (localStream) {
          localStream.getTracks().forEach((t) => t.stop());
        }
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicOn((m) => !m);
  };

  const toggleCam = () => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCamOn((c) => !c);
  };

  const endCall = () => {
    if (socketRef.current) socketRef.current.emit("call:leave", { roomId, userId: user._id });
    onClose();
  };

  return (
    <Box position="relative" w="100%" h="75vh" bg="gray.800" color="white">
      {/* Remote Streams Grid */}
      <Flex flex="1" wrap="wrap" p={3} gap={3} overflow="auto" justify="center" w="100%" h="100%">
        {remoteStreams.length === 0 && (
          <Flex justify="center" align="center" h="100%">
            <Text>Waiting for others to join...</Text>
          </Flex>
        )}
        {remoteStreams.map(({ userId, stream }) => (
          <Box
            key={userId}
            bg="black"
            borderRadius="md"
            overflow="hidden"
            flexGrow={1}
            flexBasis={{ base: "100%", md: "48%", lg: remoteStreams.length > 2 ? "32%" : "48%" }}
            h={{ base: "30vh", md: "auto" }}
          >
            <video
              playsInline
              autoPlay
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              ref={(el) => el && attachStreamToVideo(el, stream)}
            />
          </Box>
        ))}
      </Flex>

      {/* Local Stream (Picture-in-Picture) */}
      {localStream && (
        <Box
          position="absolute"
          bottom={{ base: "80px", md: "20px" }}
          right={{ base: "10px", md: "20px" }}
          w={{ base: "120px", md: "200px" }}
          h={{ base: "90px", md: "150px" }}
          bg="black"
          borderRadius="md"
          overflow="hidden"
          zIndex={1000}
          border="2px solid"
          borderColor="gray.600"
          boxShadow="lg"
        >
          <video ref={localVideoRef} muted playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Box>
      )}

      {/* Controls */}
      <Flex
        position="absolute"
        bottom="0"
        left="0"
        right="0"
        p={3}
        justify="center"
        gap={3}
        bg="rgba(0,0,0,0.4)"
      >
        <Button onClick={toggleMic} colorScheme={micOn ? "green" : "red"}>
          {micOn ? "Mute" : "Unmute"}
        </Button>
        <Button onClick={toggleCam} colorScheme={camOn ? "green" : "red"}>
          {camOn ? "Camera Off" : "Camera On"}
        </Button>
        <Button onClick={endCall} colorScheme="red">
          End Call
        </Button>
      </Flex>
    </Box>
  );
};

export default VideoCallRoom;