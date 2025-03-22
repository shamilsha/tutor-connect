import React, { useState, useEffect, useRef } from 'react';
import MediaControlPanel from './MediaControlPanel';
import '../styles/VideoChat.css';

const VideoChat = ({ provider, peers }) => {
    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
    const mainVideoRef = useRef(null);
    const pipVideoRef = useRef(null);

    // Debug logging
    useEffect(() => {
        console.log('[VideoChat] State changed:', {
            hasLocalStream: !!stream,
            hasRemoteStream: !!remoteStream,
            hasRemoteVideo,
            isVideoEnabled
        });
    }, [stream, remoteStream, hasRemoteVideo, isVideoEnabled]);

    // Handle initial local stream
    useEffect(() => {
        if (stream && mainVideoRef.current && !hasRemoteVideo) {
            console.log('[VideoChat] Setting initial local stream to main video');
            mainVideoRef.current.srcObject = stream;
        }
    }, [stream]);

    const startMedia = async (audio = false, video = true) => {
        try {
            console.log('[VideoChat] Starting media stream:', { audio, video });
            
            // If we already have a stream, just modify it
            if (stream) {
                const audioTracks = stream.getAudioTracks();
                if (audio && audioTracks.length === 0) {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
                } else if (!audio && audioTracks.length > 0) {
                    audioTracks.forEach(track => track.stop());
                    audioTracks.forEach(track => stream.removeTrack(track));
                }
                
                const videoTracks = stream.getVideoTracks();
                if (video && videoTracks.length === 0) {
                    const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                    videoStream.getVideoTracks().forEach(track => stream.addTrack(track));
                } else if (!video && videoTracks.length > 0) {
                    videoTracks.forEach(track => track.stop());
                    videoTracks.forEach(track => stream.removeTrack(track));
                }
            } else {
                // Create new stream
                const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: audio,
                    video: video 
                });
                setStream(mediaStream);
            }

            setIsVideoEnabled(video);
            setIsAudioEnabled(audio);

            // Update provider with current stream
            if (provider && stream) {
                await provider.addMediaStream(stream);
            }

            // Update video displays
            updateVideoDisplays();

        } catch (error) {
            console.error('[VideoChat] Error managing media stream:', error);
        }
    };

    const updateVideoDisplays = () => {
        if (hasRemoteVideo && remoteStream) {
            // Show remote video in main display
            if (mainVideoRef.current) {
                mainVideoRef.current.srcObject = remoteStream;
            }
            // Show local video in PiP if video is enabled
            if (pipVideoRef.current && stream && isVideoEnabled) {
                pipVideoRef.current.srcObject = stream;
            }
        } else if (isVideoEnabled && stream) {
            // Show local video in main display if no remote video
            if (mainVideoRef.current) {
                mainVideoRef.current.srcObject = stream;
            }
        }
    };

    const toggleAudio = async () => {
        await startMedia(!isAudioEnabled, isVideoEnabled);
    };

    const toggleVideo = async () => {
        await startMedia(isAudioEnabled, !isVideoEnabled);
    };

    // Handle remote stream
    useEffect(() => {
        if (!provider) return;

        provider.onTrack = (peerId, incomingStream) => {
            console.log('[VideoChat] Received remote track from peer:', peerId);
            
            const newRemoteStream = new MediaStream();
            incomingStream.getTracks().forEach(track => {
                newRemoteStream.addTrack(track);
                console.log(`[VideoChat] Added ${track.kind} track to remote stream`);
            });

            setRemoteStream(newRemoteStream);
            setHasRemoteVideo(true);

            // Update video displays
            updateVideoDisplays();
        };
    }, [provider, stream, isVideoEnabled]);

    // Update displays when streams or enabled states change
    useEffect(() => {
        updateVideoDisplays();
    }, [stream, remoteStream, hasRemoteVideo, isVideoEnabled]);

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
                <div className="main-video-wrapper">
                    <video
                        ref={mainVideoRef}
                        autoPlay
                        playsInline
                        muted={!hasRemoteVideo} // Only mute when showing local video
                        className={!isVideoEnabled && !hasRemoteVideo ? 'hidden' : ''}
                    />
                    {(!isVideoEnabled && !hasRemoteVideo) && 
                        <div className="video-placeholder">Camera Off</div>
                    }
                    {hasRemoteVideo && (
                        <div className="pip-video-wrapper">
                            <video
                                ref={pipVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className={!isVideoEnabled ? 'hidden' : ''}
                            />
                            {!isVideoEnabled && 
                                <div className="video-placeholder small">Camera Off</div>
                            }
                        </div>
                    )}
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