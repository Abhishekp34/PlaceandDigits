import React, { createContext, useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';

export const SoundContext = createContext();

export const SoundProvider = ({ children }) => {
  const [isMuted, setIsMuted] = useState(false);
  const sounds = useRef({}); // Stores the loaded audio files in memory

  useEffect(() => {
    // 1. Configure the iPhone/Android audio settings
    const setupAudio = async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true, // Forces sound even if the physical mute switch is on
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    };

    // 2. Pre-load the 5 sounds into memory
    const loadSounds = async () => {
      try {
        sounds.current.tap = (await Audio.Sound.createAsync(require('./assets/sounds/tap.mp3'))).sound;
        sounds.current.start = (await Audio.Sound.createAsync(require('./assets/sounds/start.mp3'))).sound;
        sounds.current.type = (await Audio.Sound.createAsync(require('./assets/sounds/type.mp3'))).sound;
        sounds.current.error = (await Audio.Sound.createAsync(require('./assets/sounds/error.mp3'))).sound;
        sounds.current.win = (await Audio.Sound.createAsync(require('./assets/sounds/win.mp3'))).sound;
      } catch (error) {
        console.log("Audio loading error. Make sure all 5 MP3 files are in assets/sounds/", error);
      }
    };

    setupAudio();
    loadSounds();

    // 3. Cleanup function: Unload the sounds if the app closes
    return () => {
      Object.values(sounds.current).forEach(sound => sound?.unloadAsync());
    };
  }, []);

  // 4. The universal play function
  // Notice the "forcePlay = false"
  const playSound = async (soundName, forcePlay = false) => {
    
    // If it's muted AND we aren't forcing it, abort!
    if (isMuted && !forcePlay) return; 
    
    if (!sounds.current[soundName]) return;

    try {
      await sounds.current[soundName].replayAsync(); 
    } catch (error) {
      console.log(`Failed to play ${soundName}`, error);
    }
  };

  return (
    <SoundContext.Provider value={{ playSound, isMuted, setIsMuted }}>
      {children}
    </SoundContext.Provider>
  );
};