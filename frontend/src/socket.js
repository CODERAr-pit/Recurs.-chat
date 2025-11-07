import io from "socket.io-client";

const ENDPOINT = process.env.REACT_APP_API_URL || "http://localhost:5000";
let socketInstance = null;

export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(ENDPOINT);
  }
  return socketInstance;
};