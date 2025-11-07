import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton } from "@chakra-ui/react";
import VideoCallRoom from "./VideoCallRoom";

const VideoCallModal = ({ isOpen, onClose, roomId, user }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Video Call</ModalHeader>
        <ModalCloseButton />
        <ModalBody p={0}>
          {isOpen && (
            <VideoCallRoom roomId={roomId} user={user} onClose={onClose} />
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default VideoCallModal;