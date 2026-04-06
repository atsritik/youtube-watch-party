import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:3000"); // replace with deployed URL if live

function App() {
  const playerRef = useRef(null);
  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState("");
  const [joined, setJoined] = useState(false);
  const [role, setRole] = useState("");
  const [participants, setParticipants] = useState({});
  const [videoId, setVideoId] = useState("dQw4w9WgXcQ");
  const [videoInput, setVideoInput] = useState("");

  // --- YouTube & Socket listeners ---
  useEffect(() => {
    socket.on("user_joined", ({ participants }) => setParticipants(participants));
    socket.on("user_left", ({ participants }) => setParticipants(participants));
    socket.on("role_assigned", ({ participants }) => setParticipants(participants));
    socket.on("participant_removed", ({ participants }) => setParticipants(participants));

    socket.on("play", () => playerRef.current?.playVideo());
    socket.on("pause", () => playerRef.current?.pauseVideo());
    socket.on("seek", ({ time }) => playerRef.current?.seekTo(time, true));
    socket.on("change_video", ({ videoId }) => {
      setVideoId(videoId);
      playerRef.current.loadVideoById(videoId);
    });

    socket.on("send_sync_to", ({ userId }) => {
      if (role === "Host") {
        const time = playerRef.current.getCurrentTime();
        const videoId = playerRef.current.getVideoData().video_id;
        socket.emit("send_sync", { roomId, userId, time, videoId });
      }
    });

    socket.on("sync_state", ({ time, videoId }) => {
      setVideoId(videoId);
      playerRef.current.loadVideoById(videoId);
      playerRef.current.seekTo(time, true);
    });
  }, [role, roomId]);

  // --- Initialize YouTube Player ---
  const initYouTube = () => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      playerRef.current = new window.YT.Player("player", {
        height: "360",
        width: "640",
        videoId: videoId,
        playerVars: { autoplay: 0 },
        events: {
          onStateChange: (event) => {
            if (role === "Host" || role === "Moderator") {
              const state = event.data;
              if (state === 1) socket.emit("play", { roomId });
              else if (state === 2) socket.emit("pause", { roomId });
            }
          },
        },
      });
    };
  };

  // --- Room actions ---
  const createRoom = () => {
    if (!roomId || !username) return;
    socket.emit("create_room", { roomId, username });
    setRole("Host");
    setJoined(true);
    initYouTube();
  };

  const joinRoom = () => {
    if (!roomId || !username) return;
    socket.emit("join_room", { roomId, username });
    setRole("Participant");
    setJoined(true);
    initYouTube();
  };

  // --- Host actions ---
  const assignRole = (userId, newRole) => socket.emit("assign_role", { roomId, userId, role: newRole });
  const removeParticipant = (userId) => socket.emit("remove_participant", { roomId, userId });

  // --- Utility to extract YouTube Video ID ---
  const extractVideoID = (url) => {
    const regex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? (match[1] || match[2]) : url; // if not a URL, assume it's ID
  };

  // --- Change video action ---
  const handleChangeVideo = () => {
    const id = extractVideoID(videoInput);
    setVideoId(id);
    playerRef.current.loadVideoById(id);
    socket.emit("change_video", { roomId, videoId: id });
    setVideoInput("");
  };

  return (
    <div className="container">
      <h1>YouTube Watch Party</h1>

      {!joined ? (
        <div className="join-container">
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input placeholder="Room ID" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          <button className="btn" onClick={createRoom}>Create Room</button>
          <button className="btn" onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <>
          <div id="player"></div>
          <p className="role-display">Role: <strong>{role}</strong></p>

          <div className="participants-container">
            <h3>Participants</h3>
            <ul>
              {Object.entries(participants).map(([id, p]) => (
                <li key={id}>
                  {p.username} - <span className="role">{p.role}</span>
                  {(role === "Host") && id !== socket.id && (
                    <span className="host-controls">
                      <button onClick={() => assignRole(id, "Moderator")}>Make Moderator</button>
                      <button onClick={() => assignRole(id, "Participant")}>Make Participant</button>
                      <button onClick={() => removeParticipant(id)}>Remove</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {(role === "Host" || role === "Moderator") && (
            <div className="video-control">
              <input
                placeholder="YouTube link or ID"
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
              />
              <button onClick={handleChangeVideo}>Change Video</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;