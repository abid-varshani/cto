import React, { useState, useEffect, useRef } from 'react';
import './Spinner.css';

const Spinner = ({ items, duration = 10000 }) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0); // The next item to win
  
  // Audio Context Refs
  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);

  // Animation Refs
  const requestRef = useRef();
  const startTimeRef = useRef();
  const startRotationRef = useRef(0);
  const targetRotationRef = useRef(0);
  
  // Configuration
  const DECELERATION_RATIO = 0.3; // Last 30% of duration is deceleration
  
  useEffect(() => {
    // Initialize Audio Context on user interaction (or lazy load)
    // Browsers block AudioContext until user gesture. 
    // We'll init it in the spin function.
    return () => {
      stopSound();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const startSound = () => {
    initAudio();
    if (oscillatorRef.current) return; // Already playing

    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, ctx.currentTime); // Low hum
    
    // Low pass filter to make it sound more like a motor
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    
    oscillatorRef.current = osc;
    gainNodeRef.current = gain;
  };

  const stopSound = () => {
    if (oscillatorRef.current) {
      // Fade out slightly
      const ctx = audioCtxRef.current;
      if (gainNodeRef.current) {
         gainNodeRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }
      setTimeout(() => {
          if (oscillatorRef.current) {
            oscillatorRef.current.stop();
            oscillatorRef.current.disconnect();
            oscillatorRef.current = null;
          }
      }, 200);
    }
  };

  const playWinSound = () => {
    initAudio();
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  };

  const spin = () => {
    if (isSpinning) return;
    
    setIsSpinning(true);
    
    // Calculate target
    // We want to land on items[selectedIndex]
    // The wheel has N items. Each item is 360/N degrees.
    // Index 0 is at 0 degrees (top?). 
    // Let's assume the pointer is at the top (270deg or -90deg in standard circle math, or 0deg in CSS rotate).
    // If we rotate the wheel clockwise, the item at index 0 moves clockwise.
    // To land on index i, we need the wheel to be rotated such that item i is at the top.
    // Angle of item i (initial) = i * (360 / N).
    // To bring item i to top (0), we need to rotate by - (i * 360 / N).
    // Or positive rotation: 360 - (i * 360 / N).
    
    const segmentAngle = 360 / items.length;
    // Target angle calculation
    // Item i is at angle: i * segmentAngle (relative to wheel 0, which is 3 o'clock)
    // We want Item i to be at 270 degrees (Top)
    // (i * segmentAngle + R) % 360 = 270
    // R = 270 - i * segmentAngle
    
    let targetAngle = (270 - (selectedIndex * segmentAngle));
    // Normalize to 0-360 positive
    targetAngle = (targetAngle % 360 + 360) % 360;
    
    // Add extra rotations for duration

    // We want at least `duration` time.
    // We need to calculate how many rotations fit in the `duration` given the velocity profile.
    
    // Profile:
    // T_total = duration
    // T_decel = duration * DECELERATION_RATIO
    // T_const = duration - T_decel
    
    // Let V be constant speed (deg/ms)
    // Dist_const = V * T_const
    // Dist_decel = V * T_decel / 2 (assuming linear decel)
    // Total Dist = V * (T_const + T_decel/2)
    
    // We pick a reasonable V, say 2 rotations per second? Or just derive V from desired rotations.
    // Let's say we want roughly 5-10 rotations minimum.
    const minRotations = 10;
    const distMin = minRotations * 360;
    
    // We can also just set V based on distMin and duration.
    // But we need to land exactly on targetAngle.
    
    // Total Dist = CurrentRotation + Delta
    // Delta must be > distMin.
    // TargetRotation = CurrentRotation + Delta
    // TargetRotation % 360 == targetAngle
    
    // Calculate Delta:
    // currentRot (0..360) = rotation % 360
    // We want (rotation + Delta) % 360 = targetAngle
    // Delta % 360 = (targetAngle - currentRot + 360) % 360
    
    let deltaBase = (targetAngle - (rotation % 360) + 360) % 360;
    
    // Add full rotations
    let delta = deltaBase + 360 * minRotations;
    
    // Recalculate V to match duration exactly
    // V = Delta / (T_const + T_decel/2)
    const T_total = duration;
    const T_decel = duration * DECELERATION_RATIO;
    const T_const = T_total - T_decel;
    
    const vMax = delta / (T_const + T_decel / 2);
    
    startRotationRef.current = rotation;
    targetRotationRef.current = rotation + delta;
    startTimeRef.current = null;
    
    const animate = (time) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      const elapsed = time - startTimeRef.current;
      
      if (elapsed < T_total) {
        // Calculate current position
        let currentDist = 0;
        
        if (elapsed <= T_const) {
           // Constant phase
           currentDist = vMax * elapsed;
           
           // Sound check: Play
           startSound();
        } else {
           // Decel phase
           // Sound check: Stop
           stopSound();
           
           const t_dec = elapsed - T_const;
           // Velocity v(t) = vMax * (1 - t_dec/T_decel)
           // Dist = Dist_const + Integral(v(t))
           // Integral = vMax * (t_dec - t_dec^2 / (2 * T_decel))
           
           const distDecel = vMax * (t_dec - (t_dec * t_dec) / (2 * T_decel));
           currentDist = (vMax * T_const) + distDecel;
        }
        
        setRotation(startRotationRef.current + currentDist);
        requestRef.current = requestAnimationFrame(animate);
      } else {
        // Finished
        setRotation(targetRotationRef.current);
        setIsSpinning(false);
        stopSound();
        playWinSound();
        
        // Prepare next index
        setSelectedIndex((prev) => (prev + 1) % items.length);
        if (onWin) onWin(items[selectedIndex]);
      }
    };
    
    requestRef.current = requestAnimationFrame(animate);
  };

  const getSegmentColor = (index, total) => {
    const hue = Math.round((index / total) * 360);
    return `hsl(${hue}, 70%, 60%)`;
  };

  const gradient = `conic-gradient(
    from 0deg,
    ${items.map((_, i) => {
      const start = (i / items.length) * 100;
      const end = ((i + 1) / items.length) * 100;
      return `${getSegmentColor(i, items.length)} ${start}% ${end}%`;
    }).join(', ')}
  )`;

  return (
    <div className="spinner-container">
      <div className="spinner-pointer">▼</div>
      <div 
        className="spinner-wheel" 
        style={{ 
          transform: `rotate(${rotation}deg)`,
          transition: isSpinning ? 'none' : 'transform 0.5s ease',
          background: gradient
        }}
      >
        {items.map((item, index) => {
          const angle = (360 / items.length) * index;
          return (
            <div 
              key={index} 
              className="spinner-item"
              style={{ 
                transform: `rotate(${angle}deg)`, 
                // remove translateY because we positioned item at center and using width as radius
              }}
            >
              <span className="spinner-text">{item}</span>
            </div>
          );
        })}
      </div>
      <button 
        className="spinner-button" 
        onClick={spin} 
        disabled={isSpinning}
      >
        {isSpinning ? 'Spinning...' : 'SPIN'}
      </button>
      <div className="spinner-status">
        Next: {items[selectedIndex]} (Debug)
      </div>
    </div>
  );
};

export default Spinner;
