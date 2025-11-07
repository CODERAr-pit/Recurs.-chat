import React, { createContext, useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";

const ChatContext = createContext();

const ChatProvider = ({ children }) => {
  const [selectedChat, setSelectedChat] = useState();
  const [user, setUser] = useState();
  const [notification, setNotification] = useState([]);
  const [chats, setChats] = useState();

  const history = useHistory();

  useEffect(() => {
    try {
      const userInfoStr = localStorage.getItem("userInfo");
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        setUser(userInfo);
        
        if (!userInfo) history.push("/");
      } else {
        history.push("/");
      }
    } catch (error) {
      console.error("Error parsing user info from localStorage:", error);
      localStorage.removeItem("userInfo");
      history.push("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  return (
    <ChatContext.Provider
      value={{
        selectedChat,
        setSelectedChat,
        user,
        setUser,
        notification,
        setNotification,
        chats,
        setChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const ChatState = () => {
  return useContext(ChatContext);
};

export default ChatProvider;
