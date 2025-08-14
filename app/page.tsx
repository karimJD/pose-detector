'use client';

import React, { useRef, useEffect, useState, FC } from 'react';

// Define the interface for a single pose landmark from MediaPipe.
interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

// Define the interface for a landmark converted to pixel coordinates.
interface PixelLandmark {
  x: number;
  y: number;
}

// Define the structure of the results object from the MediaPipe model.
interface MediaPipeResults {
  image: ImageBitmap;
  poseLandmarks: PoseLandmark[];
  poseWorldLandmarks: PoseLandmark[];
  segmentationMask: ImageData;
}

// Define the structure for the calculated spine points.
interface SpinePoints {
  nose: PixelLandmark;
  neck: PixelLandmark;
  upperSpine: PixelLandmark;
  midSpine: PixelLandmark;
  lowerSpine: PixelLandmark;
  hipCenter: PixelLandmark;
}

// Define the structure for the posture analysis results.
interface SpineAnalysis {
  isAligned: boolean;
  avgDeviation: number;
  maxDeviation: number;
  severity: 'excellent' | 'good' | 'moderate' | 'severe';
}

// This 'declare global' block is the fix for the TypeScript error.
// It informs the compiler about the global objects loaded from the MediaPipe scripts.
declare global {
  interface Window {
    Pose: any; // A simple `any` type is sufficient for this purpose.
    Camera: any; // Same for the Camera object.
  }
}

/**
 * @file PostureDetector.jsx
 * @description A React component that uses the MediaPipe Pose model to detect and analyze a user's posture
 * via their webcam. This TypeScript version adds type safety, ensuring that data structures are
 * consistent throughout the application.
 */
const PostureDetector: FC = () => {
  // A ref to hold the HTML video element for the webcam stream.
  const videoRef = useRef<HTMLVideoElement>(null);
  // A ref to hold the HTML canvas element for drawing the pose landmarks and feedback.
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // A state variable to store and display real-time textual feedback to the user.
  const [feedback, setFeedback] = useState<string>('');
  // A state variable to track the current status of the spine's alignment.
  const [spineStatus, setSpineStatus] = useState<string>('checking');

  /**
   * The primary useEffect hook for the component.
   * It runs only once on mount to initialize the MediaPipe Pose model and the camera.
   */
  useEffect(() => {
    /**
     * Helper function to dynamically load a JavaScript file from a given URL.
     * @param {string} src The URL of the script to load.
     * @returns {Promise<void>} A promise that resolves when the script is loaded.
     */
    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = (error) => reject(error);
        document.head.appendChild(script);
      });
    };

    /**
     * Asynchronous function to initialize the entire application.
     * It handles the sequential loading of scripts, setting up the webcam, and configuring the pose model.
     */
    const initApp = async (): Promise<void> => {
      try {
        await loadScript(
          'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js'
        );
        await loadScript(
          'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'
        );
        await loadScript(
          'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js'
        );

        // Type guard to ensure global objects are available after loading the scripts.
        if (
          typeof window.Pose === 'undefined' ||
          typeof window.Camera === 'undefined'
        ) {
          throw new Error('MediaPipe libraries failed to load.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const pose = new window.Pose({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentationMask: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        pose.onResults(onResults);

        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current) {
              await pose.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });
        camera.start();
      } catch (error) {
        console.error('Error initializing MediaPipe or camera:', error);
        setFeedback('Error: Unable to load camera or detection models.');
      }
    };

    initApp();
  }, []);

  /**
   * The main callback function for MediaPipe's `onResults`.
   * It processes the landmark data, performs posture analysis, and draws the results on the canvas.
   * @param {MediaPipeResults} results - The results object from MediaPipe Pose, now with a defined type.
   */
  const onResults = (results: MediaPipeResults): void => {
    // Log the raw results object from MediaPipe.
    console.log('Raw MediaPipe results:', results);

    const canvasElement = canvasRef.current;
    const videoElement = videoRef.current;
    if (!canvasElement || !videoElement) return;

    const canvasCtx = canvasElement.getContext('2d');
    if (!canvasCtx) return;

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.fillStyle = '#1a1a1a';
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    const poseLandmarks = results.poseLandmarks;
    if (poseLandmarks) {
      const pixelLandmarks: PixelLandmark[] = poseLandmarks.map((landmark) => ({
        x: landmark.x * canvasElement.width,
        y: landmark.y * canvasElement.height,
      }));

      // Log the pixel-based landmarks.
      console.log('Pixel Landmarks:', pixelLandmarks);

      const spinePoints = generateSpinePoints(pixelLandmarks);
      const spineAnalysis = analyzeSpineAlignment(
        spinePoints,
        canvasElement.width
      );

      // Log the calculated spine points and the posture analysis results.
      console.log('Calculated Spine Points:', spinePoints);
      console.log('Spine Analysis Results:', spineAnalysis);

      drawAlignmentGuide(canvasCtx, canvasElement.width, canvasElement.height);
      drawStickFigure(canvasCtx, pixelLandmarks);
      drawSpineLine(canvasCtx, spinePoints, spineAnalysis.isAligned);

      updateFeedback(pixelLandmarks, spineAnalysis);
    } else {
      setFeedback(
        'Posture not detected. Please position yourself facing the camera.'
      );
      setSpineStatus('checking');
    }

    canvasCtx.restore();
  };

  /**
   * Creates a set of spine landmarks by interpolating between known MediaPipe landmarks.
   * @param {PixelLandmark[]} landmarks - The list of pixel landmarks.
   * @returns {SpinePoints | null} An object containing the calculated spine points, or null if landmarks are missing.
   */
  const generateSpinePoints = (
    landmarks: PixelLandmark[]
  ): SpinePoints | null => {
    if (!landmarks || landmarks.length < 33) return null;

    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    const shoulderCenter = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
    };
    const hipCenter = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
    };

    const neck = {
      x: (nose.x + shoulderCenter.x) / 2,
      y: (nose.y + shoulderCenter.y) / 2,
    };
    const upperSpine = {
      x: (shoulderCenter.x + hipCenter.x * 2) / 3,
      y: (shoulderCenter.y + hipCenter.y * 2) / 3,
    };
    const midSpine = {
      x: (shoulderCenter.x + hipCenter.x) / 2,
      y: (shoulderCenter.y + hipCenter.y) / 2,
    };
    const lowerSpine = {
      x: (shoulderCenter.x * 2 + hipCenter.x) / 3,
      y: (shoulderCenter.y * 2 + hipCenter.y) / 3,
    };

    return { nose, neck, upperSpine, midSpine, lowerSpine, hipCenter };
  };

  /**
   * Analyzes the spine's horizontal alignment.
   * @param {SpinePoints | null} spinePoints - The calculated points along the spine.
   * @param {number} width - The width of the canvas.
   * @returns {SpineAnalysis} An object with alignment status and deviation metrics.
   */
  const analyzeSpineAlignment = (
    spinePoints: SpinePoints | null,
    width: number
  ): SpineAnalysis => {
    if (!spinePoints) {
      return {
        isAligned: false,
        avgDeviation: 0,
        maxDeviation: 0,
        severity: 'severe',
      };
    }

    const centerLine = width / 2;
    let totalDeviation = 0;
    let maxDeviation = 0;

    const pointsArray = [
      spinePoints.nose,
      spinePoints.neck,
      spinePoints.upperSpine,
      spinePoints.midSpine,
      spinePoints.lowerSpine,
      spinePoints.hipCenter,
    ];

    pointsArray.forEach((point) => {
      const deviation = Math.abs(point.x - centerLine);
      totalDeviation += deviation;
      maxDeviation = Math.max(maxDeviation, deviation);
    });

    const avgDeviation = totalDeviation / pointsArray.length;
    const isAligned = avgDeviation < 25 && maxDeviation < 40;

    let severity: 'excellent' | 'good' | 'moderate' | 'severe';
    if (maxDeviation < 25) severity = 'excellent';
    else if (maxDeviation < 40) severity = 'good';
    else if (maxDeviation < 60) severity = 'moderate';
    else severity = 'severe';

    return {
      isAligned,
      avgDeviation: Math.round(avgDeviation),
      maxDeviation: Math.round(maxDeviation),
      severity,
    };
  };

  /**
   * Updates the component's state with new, human-readable feedback messages.
   * @param {PixelLandmark[]} landmarks - The list of pixel landmarks.
   * @param {SpineAnalysis} spineAnalysis - The results of the spine analysis.
   */
  const updateFeedback = (
    landmarks: PixelLandmark[],
    spineAnalysis: SpineAnalysis
  ): void => {
    if (!landmarks || landmarks.length < 33) {
      setFeedback(
        'Posture not detected. Please position yourself facing the camera.'
      );
      setSpineStatus('checking');
      return;
    }

    const { nose, leftShoulder, rightShoulder } = {
      nose: landmarks[0],
      leftShoulder: landmarks[11],
      rightShoulder: landmarks[12],
    };
    const feedbackMessages: string[] = [];

    const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y);
    if (shoulderTilt > 15) {
      feedbackMessages.push('⚠️ Keep your shoulders straight.');
    }

    switch (spineAnalysis.severity) {
      case 'excellent':
        feedbackMessages.push('✅ Excellent spine posture!');
        setSpineStatus('excellent');
        break;
      case 'good':
        feedbackMessages.push('✅ Good spine posture.');
        setSpineStatus('good');
        break;
      case 'moderate':
        feedbackMessages.push('⚠️ Spine alignment needs improvement.');
        setSpineStatus('moderate');
        break;
      case 'severe':
        feedbackMessages.push('🚨 Major posture correction needed!');
        setSpineStatus('severe');
        break;
    }

    const leftDist = Math.abs(nose.x - leftShoulder.x);
    const rightDist = Math.abs(nose.x - rightShoulder.x);
    const symmetryRatio = leftDist / rightDist;

    if (symmetryRatio > 1.2) {
      feedbackMessages.push('Body is slightly turned to the right.');
    } else if (symmetryRatio < 0.8) {
      feedbackMessages.push('Body is slightly turned to the left.');
    } else {
      feedbackMessages.push('Body is facing the camera.');
    }

    feedbackMessages.push(
      `Average deviation: ${spineAnalysis.avgDeviation}px, Maximum: ${spineAnalysis.maxDeviation}px`
    );

    // Log the messages before they are joined into a single string.
    console.log('Feedback Messages:', feedbackMessages);

    setFeedback(feedbackMessages.join(' '));
  };

  /**
   * Draws a simple stick figure skeleton on the canvas based on the detected landmarks.
   * @param {CanvasRenderingContext2D} ctx - The canvas 2D context.
   * @param {PixelLandmark[]} landmarks - The list of pixel landmarks.
   */
  const drawStickFigure = (
    ctx: CanvasRenderingContext2D,
    landmarks: PixelLandmark[]
  ): void => {
    if (!landmarks || landmarks.length < 33) return;

    const connections = [
      [landmarks[11], landmarks[13]],
      [landmarks[13], landmarks[15]],
      [landmarks[12], landmarks[14]],
      [landmarks[14], landmarks[16]],
      [landmarks[11], landmarks[12]],
      [landmarks[23], landmarks[24]],
      [landmarks[11], landmarks[23]],
      [landmarks[12], landmarks[24]],
      [landmarks[23], landmarks[25]],
      [landmarks[25], landmarks[27]],
      [landmarks[24], landmarks[26]],
      [landmarks[26], landmarks[28]],
    ];

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#00ff00';

    connections.forEach(([start, end]) => {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    });

    landmarks.forEach((joint) => {
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  /**
   * Draws a dotted vertical line down the center of the canvas.
   * @param {CanvasRenderingContext2D} ctx - The canvas 2D context.
   * @param {number} width - The width of the canvas.
   * @param {number} height - The height of the canvas.
   */
  const drawAlignmentGuide = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);

    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Center Reference', width / 2, 30);
  };

  /**
   * Draws the spine line and points, color-coded based on the alignment analysis.
   * @param {CanvasRenderingContext2D} ctx - The canvas 2D context.
   * @param {SpinePoints | null} spinePoints - The calculated spine points.
   * @param {boolean} isAligned - Whether the spine is considered aligned.
   */
  const drawSpineLine = (
    ctx: CanvasRenderingContext2D,
    spinePoints: SpinePoints | null,
    isAligned: boolean
  ): void => {
    if (!spinePoints) return;

    ctx.strokeStyle = isAligned ? '#00ff00' : '#ff3333';
    ctx.lineWidth = 5;
    ctx.setLineDash([]);

    const pointsArray = [
      spinePoints.nose,
      spinePoints.neck,
      spinePoints.upperSpine,
      spinePoints.midSpine,
      spinePoints.lowerSpine,
      spinePoints.hipCenter,
    ];

    ctx.beginPath();
    ctx.moveTo(pointsArray[0].x, pointsArray[0].y);
    for (let i = 1; i < pointsArray.length - 1; i++) {
      const current = pointsArray[i];
      const next = pointsArray[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    const lastPoint = pointsArray[pointsArray.length - 1];
    ctx.lineTo(lastPoint.x, lastPoint.y);
    ctx.stroke();

    ctx.fillStyle = isAligned ? '#00ff00' : '#ff3333';
    pointsArray.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 0 ? 8 : 6, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  /**
   * Helper function to get the appropriate Tailwind CSS class for the status indicator color.
   * @param {string} status - The current spine status string.
   * @returns {string} The Tailwind CSS class string.
   */
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'excellent':
        return 'bg-green-600';
      case 'good':
        return 'bg-green-500';
      case 'moderate':
        return 'bg-yellow-500';
      case 'severe':
        return 'bg-red-600';
      default:
        return 'bg-gray-500';
    }
  };

  /**
   * Helper function to get the descriptive text for the status indicator.
   * @param {string} status - The current spine status.
   * @returns {string} The descriptive status text.
   */
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'excellent':
        return '🌟 Excellent';
      case 'good':
        return '✅ Good';
      case 'moderate':
        return '⚠️ Needs Improvement';
      case 'severe':
        return '🚨 Critical';
      default:
        return '⏳ Checking...';
    }
  };

  return (
    <div className='min-h-screen bg-gray-900 p-4 font-sans'>
      <div className='max-w-4xl mx-auto'>
        <h1 className='text-3xl font-bold text-white text-center mb-6'>
          🔍 Posture Detection with Spine Analysis
        </h1>

        <div className='relative bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-700'>
          <video
            ref={videoRef}
            className='w-full h-auto'
            autoPlay
            playsInline
          />
          <canvas ref={canvasRef} className='w-full h-auto' />

          {/* Status indicators */}
          <div className='absolute top-4 left-4 flex gap-2'>
            <div
              className={`px-4 py-2 rounded-full text-sm font-bold text-white ${getStatusColor(
                spineStatus
              )}`}
            >
              {getStatusText(spineStatus)}
            </div>
          </div>

          {/* Legend */}
          <div className='absolute top-4 right-4 bg-black bg-opacity-70 rounded-lg p-3 text-white text-sm'>
            <div className='space-y-1'>
              <div className='flex items-center gap-2'>
                <div className='w-4 h-1 bg-green-500'></div>
                <span>Aligned Spine</span>
              </div>
              <div className='flex items-center gap-2'>
                <div className='w-4 h-1 bg-red-500'></div>
                <span>Misaligned Spine</span>
              </div>
              <div className='flex items-center gap-2'>
                <div
                  className='w-4 h-1 bg-white opacity-30'
                  style={{ borderStyle: 'dashed' }}
                ></div>
                <span>Center Reference</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feedback panel */}
        <div className='mt-6 bg-gray-800 rounded-lg p-6 border border-gray-700'>
          <h3 className='text-xl font-semibold text-white mb-4'>
            📊 Real-Time Posture Analysis
          </h3>
          <div
            className={`p-4 rounded-lg border-2 transition-colors duration-300 ${
              feedback.includes('🌟') || feedback.includes('✅')
                ? 'bg-green-900/20 border-green-500'
                : feedback.includes('⚠️')
                ? 'bg-yellow-900/20 border-yellow-500'
                : feedback.includes('🚨')
                ? 'bg-red-900/20 border-red-500'
                : 'bg-gray-900/20 border-gray-500'
            }`}
          >
            <p className='text-white leading-relaxed'>
              {feedback || 'Analysis in progress...'}
            </p>
          </div>
          <div className='text-sm text-gray-400 mt-2'>
            Average deviation from center:{' '}
            <span className='font-semibold'>
              {feedback.split('Average deviation: ')[1]?.split('px')[0]}px
            </span>
          </div>
        </div>

        {/* Instructions */}
        <div className='mt-6 bg-gray-800 rounded-lg p-6 border border-gray-700'>
          <h4 className='text-white font-semibold mb-3'>📋 How to use:</h4>
          <div className='grid md:grid-cols-2 gap-4 text-gray-300 text-sm'>
            <div>
              <h5 className='font-medium text-white mb-2'>Positioning:</h5>
              <ul className='space-y-1'>
                <li>• Stand facing the screen</li>
                <li>• Keep your shoulders aligned</li>
                <li>• Look straight ahead</li>
              </ul>
            </div>
            <div>
              <h5 className='font-medium text-white mb-2'>
                Reading the Results:
              </h5>
              <ul className='space-y-1'>
                <li>
                  • <span className='text-green-400'>Green Line</span>: Good
                  posture
                </li>
                <li>
                  • <span className='text-red-400'>Red Line</span>: Posture
                  needs correction
                </li>
                <li>• Follow the white dotted center line</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostureDetector;
