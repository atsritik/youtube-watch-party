import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import YouTube from 'react-youtube';
import './App.css';

// Connect to your local backend
const socket = io('http://localhost:5000');

function App() {
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [videoId, setVideoId] = useState('dQw4w9WgXcQ');
  const [userRole, setUserRole] = useState('Participant');
  const [player, setPlayer] = useState(null);
  const [inputUrl, setInputUrl] = useState('');

  const isSyncing = useRef(false);

  useEffect(() => {
    // Role and Participant List Updates
    socket.on('role_assigned', ({ userId, role, participants: pList }) => {
      if (userId === socket.id) setUserRole(role);
      setParticipants(pList);
    });

    socket.on('user_joined', ({ participants: pList }) => setParticipants(pList));
    socket.on('user_left', ({ participants: pList }) => setParticipants(pList));
    
    // Initial Sync
    socket.on('sync_state', (state) => setVideoId(state.videoId));

    // Playback Sync Listeners
    socket.on('play', () => {
      isSyncing.current = true;
      player?.playVideo();
    });

    socket.on('pause', () => {
      isSyncing.current = true;
      player?.pauseVideo();
    });

    socket.on('seek', ({ time }) => {
      isSyncing.current = true;
      player?.seekTo(time);
    });

    socket.on('change_video', ({ videoId: newId }) => setVideoId(newId));

    socket.on('participant_removed', () => {
      alert("You have been removed from the room.");
      window.location.reload();
    });

    return () => socket.off();
  }, [player]);

  const joinRoom = () => {
    if (roomId && username) {
      socket.emit('join_room', { roomId, username });
      setJoined(true);
    }
  };

  const hasControl = userRole === 'Host' || userRole === 'Moderator';

  const onStateChange = (event) => {
    if (isSyncing.current) {
      isSyncing.current = false;
      return;
    }
    if (!hasControl) return;

    // Send Play (1) or Pause (2) events to server
    if (event.data === 1) socket.emit('play', { roomId });
    if (event.data === 2) socket.emit('pause', { roomId });
  };

  const handleVideoChange = () => {
    let vId = '';
    if (inputUrl.includes('v=')) vId = inputUrl.split('v=')[1].split('&')[0];
    else if (inputUrl.includes('youtu.be/')) vId = inputUrl.split('youtu.be/')[1].split('?')[0];
    else vId = inputUrl; // Fallback for direct ID entry

    if (vId) {
      socket.emit('change_video', { roomId, videoId: vId });
      setInputUrl('');
    }
  };

  if (!joined) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>YouTube Watch Party</h1>
          <input placeholder="Enter Username" onChange={e => setUsername(e.target.value)} />
          <input placeholder="Enter Room ID" onChange={e => setRoomId(e.target.value)} />
          <button className="join-btn" onClick={joinRoom}>Join / Create Room</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <div className="header">
          <h2>Room: {roomId} | <span className="role-text">You: {userRole}</span></h2>
          {hasControl && (
            <div className="update-video-bar">
              <input 
                value={inputUrl} 
                onChange={e => setInputUrl(e.target.value)} 
                placeholder="Paste YouTube Link" 
              />
              <button onClick={handleVideoChange}>Update Video</button>
            </div>
          )}
        </div>

        <div className="video-section">
          <YouTube 
            videoId={videoId} 
            onReady={e => setPlayer(e.target)} 
            onStateChange={onStateChange}
            opts={{ 
              width: '100%', 
              height: '450px', 
              playerVars: { 
                controls: hasControl ? 1 : 0, 
                autoplay: 1, 
                mute: 1      
              } 
            }} 
          />
          <p className="hint">Note: Video is muted by default. Click the speaker icon to unmute.</p>
        </div>
      </div>

      <div className="sidebar">
        <h3>Participants</h3>
        <div className="participant-list">
          {participants.map(p => (
            <div key={p.userId} className={`participant-item ${p.userId === socket.id ? 'is-me' : ''}`}>
              <span>{p.username} <strong>({p.role})</strong></span>
              {userRole === 'Host' && p.userId !== socket.id && (
                <div className="admin-actions">
                  <button onClick={() => socket.emit('assign_role', { roomId, userId: p.userId, role: 'Moderator' })}>Mod</button>
                  <button className="kick-btn" onClick={() => socket.emit('remove_participant', { roomId, userId: p.userId })}>Kick</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;