import "./App.css";
import Homepage from "./Pages/Homepage";
import { Route, BrowserRouter as Router } from "react-router-dom";
import Chatpage from "./Pages/Chatpage";

function App() {
  return (
    <Router>
      <div className="App">
        <Route path="/" component={Homepage} exact />
        <Route path="/chats" component={Chatpage} />
      </div>
    </Router>
  );
}

export default App;
