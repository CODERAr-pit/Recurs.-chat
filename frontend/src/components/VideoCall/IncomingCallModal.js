import { useEffect, useRef } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Button,
  Text,
} from "@chakra-ui/react";

const IncomingCallModal = ({ isOpen, onClose, invite, onAccept, onReject }) => {
  const audioRef = useRef(null);

  useEffect(() => {
    if (isOpen && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Incoming Call</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text>
            {invite?.isGroup ? "Group call" : "Call"} from {invite?.fromUser?.name}
          </Text>
          <audio ref={audioRef} loop>
            <source src="https://actions.google.com/sounds/v1/alarms/phone_alerts_and_ringtones.ogg" type="audio/ogg" />
          </audio>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="green" mr={3} onClick={onAccept}>
            Accept
          </Button>
          <Button colorScheme="red" onClick={onReject}>Decline</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default IncomingCallModal;