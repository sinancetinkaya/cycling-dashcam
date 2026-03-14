import { useState, useEffect } from 'react';
import Dashcam from './components/Dashcam';

export default function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Global listener for fullscreen changes to update UI state
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      console.log("Fullscreen change detected in App.tsx:", isFs);
      setIsFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden">
      {/* The main Dashcam component handles all camera and recording logic */}
      <Dashcam />
    </div>
  );
}
