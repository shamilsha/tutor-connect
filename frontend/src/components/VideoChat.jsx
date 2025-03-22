import React, { useState, useEffect, useRef } from 'react';
import MediaControlPanel from './MediaControlPanel';
import '../styles/VideoChat.css';

const VideoChat = ({ provider, peers }) => {
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(new MediaStream());
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

    useEffect(() => {
        if (provider) {
            provider.onTrack = (peerId, stream) => {
                console.log('[VideoChat] Received remote stream from:', peerId, 
                    'video tracks:', stream.getVideoTracks().length,
                    'audio tracks:', stream.getAudioTracks().length);
                
                // Get or create remote stream
                let currentRemoteStream = remoteVideoRef.current?.srcObject;
                if (!currentRemoteStream) {
                    currentRemoteStream = new MediaStream();
                    setRemoteStream(currentRemoteStream);
                    remoteVideoRef.current.srcObject = currentRemoteStream;
                }

                // Add new tracks to existing stream
                stream.getTracks().forEach(track => {
                    const existingTrack = currentRemoteStream.getTracks().find(t => t.kind === track.kind);
                    if (existingTrack) {
                        currentRemoteStream.removeTrack(existingTrack);
                    }
                    currentRemoteStream.addTrack(track);
                    console.log(`[VideoChat] Added ${track.kind} track to remote stream`);
                });

                // Ensure the video plays
                remoteVideoRef.current?.play().catch(error => {
                    console.error('[VideoChat] Error playing remote video:', error);
                });
            };
        }

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            if (remoteStream) {
                remoteStream.getTracks().forEach(track => track.stop());
            }
            if (provider) {
                provider.onTrack = null;
            }
        };
    }, [provider]);

    const startMedia = async (audio, video) => {
        try {
            // Stop existing tracks
            if (stream) {
                stream.getTracks().forEach(track => {
                    track.stop();
                });
            }

            // Get new stream
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: audio,
                video: video
            });

            // Set stream to video element first
            setStream(newStream);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = newStream;
            }

            // Enable tracks based on settings
            newStream.getAudioTracks().forEach(track => {
                track.enabled = audio;
            });
            newStream.getVideoTracks().forEach(track => {
                track.enabled = video;
            });

            // Add tracks to peer connections if connected
            if (provider && peers.length > 0) {
                console.log('[VideoChat] Adding media stream to provider');
                await provider.addMediaStream(newStream);
            }

            setIsAudioEnabled(audio);
            setIsVideoEnabled(video);
        } catch (error) {
            console.error('Error accessing media devices:', error);
        }
    };

    const toggleAudio = async () => {
        if (stream) {
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
                const newState = !audioTracks[0].enabled;
                audioTracks.forEach(track => {
                    track.enabled = newState;
                });
                setIsAudioEnabled(newState);
            } else {
                await startMedia(true, isVideoEnabled);
            }
        } else {
            await startMedia(true, false);
        }
    };

    const toggleVideo = async () => {
        if (stream) {
            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length > 0) {
                const newState = !videoTracks[0].enabled;
                videoTracks.forEach(track => {
                    track.enabled = newState;
                });
                setIsVideoEnabled(newState);
            } else {
                await startMedia(isAudioEnabled, true);
            }
        } else {
            await startMedia(false, true);
        }
    };

    // Start media when peer connects
    useEffect(() => {
        if (peers.length > 0 && stream) {
            console.log('[VideoChat] Peer connected, adding existing media stream');
            provider?.addMediaStream(stream);
        }
    }, [peers, stream, provider]);

    return (
        <div className="video-chat">
            <div className="video-container">
                <div className="video-wrapper local">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={!isVideoEnabled ? 'hidden' : ''}
                    />
                    {!isVideoEnabled && <div className="video-placeholder">Camera Off</div>}
                </div>
                <div className="video-wrapper remote">
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className={!remoteStream ? 'hidden' : ''}
                    />
                    {!remoteStream && <div className="video-placeholder">No Remote Video</div>}
                </div>
            </div>
            <MediaControlPanel
                isAudioEnabled={isAudioEnabled}
                isVideoEnabled={isVideoEnabled}
                onToggleAudio={toggleAudio}
                onToggleVideo={toggleVideo}
            />
        </div>
    );
};

export default VideoChat; 