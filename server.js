import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  exposedHeaders: ['Content-Type', 'Cache-Control', 'X-Accel-Buffering']
}));

app.use(express.json());

// Multer configuration for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG and PNG allowed.'));
    }
  }
});

// Helper function to upload to Supabase
async function uploadToSupabase(buffer, bucket, filename, mimetype) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType: mimetype,
      cacheControl: '3600',
      upsert: false
    });
  
  if (error) {
    console.error('Supabase upload error:', error);
    throw new Error(`Failed to upload to ${bucket}: ${error.message}`);
  }
  
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(filename);
  
  return data.publicUrl;
}

// Helper function to generate unique filename
function generateFilename(type, extension) {
  const uuid = uuidv4();
  const timestamp = Date.now();
  return `${uuid}-${timestamp}-${type}.${extension}`;
}

// Helper function to send SSE event
function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Nano Banana API - Image Enhancement using Gemini 2.5 Flash Image
async function enhanceImageWithNanoBanana(imageBuffer, imageName, mimetype) {
  try {
    console.log(`Enhancing ${imageName} with Gemini Nano Banana...`);
    
    const ai = new GoogleGenAI({ apiKey: process.env.NANO_BANANA_KEY });
    
    const base64Image = imageBuffer.toString('base64');
    const mimeType = mimetype || 'image/jpeg';
    
    const prompt = [
      { 
        text: "Transform this raw clothing image into a high-quality studio-grade fashion photo. Keep the clothing design, texture, and color accurate. Place the item on an appropriate model with natural body proportions and realistic fabric fit. Use professional studio lighting and a pure white background. The result should look like an authentic e-commerce catalog image — clean, sharp, and ready for product listing."
      },
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Image,
        },
      },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: prompt,
    });

    // Extract the enhanced image from response
    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const enhancedImageData = part.inlineData.data;
          const enhancedBuffer = Buffer.from(enhancedImageData, "base64");
          console.log(`✅ Successfully enhanced ${imageName} with Gemini`);
          return enhancedBuffer;
        }
      }
    }
    
    // If no image in response, return original
    console.warn(`⚠️ No enhanced image returned for ${imageName}, using original`);
    return imageBuffer;
    
  } catch (error) {
    console.error(`❌ Nano Banana enhancement error for ${imageName}:`, error.message);
    // Return original buffer on error to continue the process
    return imageBuffer;
  }
}

// Seedream API - Generate Side Angles
async function generateSideAnglesWithSeedream(frontBuffer, backBuffer) {
  try {
    // Mock implementation - in production, call actual Seedream 4.0 API
    // This would generate left and right side views from front/back images
    
    const leftAngle = frontBuffer; // Placeholder
    const rightAngle = backBuffer; // Placeholder
    
    return { leftAngle, rightAngle };
  } catch (error) {
    console.error('Seedream API error:', error);
    throw error;
  }
}

// Kling AI API - Video Generation
async function generateVideoWithKling(images) {
  try {
    // Mock implementation - in production, call actual Kling AI API
    // This would create a video from the 4 images (front, back, left, right)
    
    // Return a mock video buffer
    const mockVideoBuffer = Buffer.from('mock-video-data');
    return mockVideoBuffer;
  } catch (error) {
    console.error('Kling AI API error:', error);
    throw error;
  }
}

// Main video generation endpoint
app.post('/api/generate-video', upload.fields([
  { name: 'frontImage', maxCount: 1 },
  { name: 'backImage', maxCount: 1 }
]), async (req, res) => {
  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const uploadedFiles = [];
  const costs = {
    enhancement: 0.08,
    sideAngles: 0.12,
    videoCreation: 1.27,
    total: 1.47
  };

  try {
    // Validate uploaded files
    if (!req.files?.frontImage || !req.files?.backImage) {
      throw new Error('Both frontImage and backImage are required');
    }

    const frontImage = req.files.frontImage[0];
    const backImage = req.files.backImage[0];

    // STEP 1: Upload & Validate (10% progress)
    sendSSE(res, {
      step: 1,
      progress: 10,
      message: 'Uploading images...',
      status: 'processing'
    });

    const frontExt = frontImage.mimetype === 'image/png' ? 'png' : 'jpg';
    const backExt = backImage.mimetype === 'image/png' ? 'png' : 'jpg';

    const frontFilename = generateFilename('front', frontExt);
    const backFilename = generateFilename('back', backExt);

    const frontUrl = await uploadToSupabase(
      frontImage.buffer,
      'source-images',
      frontFilename,
      frontImage.mimetype
    );

    const backUrl = await uploadToSupabase(
      backImage.buffer,
      'source-images',
      backFilename,
      backImage.mimetype
    );

    uploadedFiles.push(frontUrl, backUrl);

    // STEP 2: Nano Banana Enhancement (25% progress)
    sendSSE(res, {
      step: 2,
      progress: 25,
      message: 'Enhancing quality with Nano Banana...',
      status: 'processing'
    });

    const enhancedFront = await enhanceImageWithNanoBanana(
      frontImage.buffer,
      'front',
      frontImage.mimetype
    );
    
    const enhancedBack = await enhanceImageWithNanoBanana(
      backImage.buffer,
      'back',
      backImage.mimetype
    );

    const enhancedFrontFilename = generateFilename('enhanced-front', frontExt);
    const enhancedBackFilename = generateFilename('enhanced-back', backExt);

    await uploadToSupabase(
      enhancedFront,
      'enhanced-images',
      enhancedFrontFilename,
      frontImage.mimetype
    );

    await uploadToSupabase(
      enhancedBack,
      'enhanced-images',
      enhancedBackFilename,
      backImage.mimetype
    );

    // STEP 3: Seedream Side Angles (50% progress)
    sendSSE(res, {
      step: 3,
      progress: 50,
      message: 'Generating side angles with Seedream 4.0...',
      status: 'processing'
    });

    const { leftAngle, rightAngle } = await generateSideAnglesWithSeedream(
      enhancedFront,
      enhancedBack
    );

    const leftFilename = generateFilename('left', 'jpg');
    const rightFilename = generateFilename('right', 'jpg');

    const leftUrl = await uploadToSupabase(
      leftAngle,
      'generated-angles',
      leftFilename,
      'image/jpeg'
    );

    const rightUrl = await uploadToSupabase(
      rightAngle,
      'generated-angles',
      rightFilename,
      'image/jpeg'
    );

    uploadedFiles.push(leftUrl, rightUrl);

    // STEP 4: Kling AI Video (80% progress)
    sendSSE(res, {
      step: 4,
      progress: 80,
      message: 'Creating video with Kling AI...',
      status: 'processing'
    });

    const videoBuffer = await generateVideoWithKling({
      front: enhancedFront,
      back: enhancedBack,
      left: leftAngle,
      right: rightAngle
    });

    const videoFilename = generateFilename('video', 'mp4');
    const videoUrl = await uploadToSupabase(
      videoBuffer,
      'generated-videos',
      videoFilename,
      'video/mp4'
    );

    // STEP 5: Complete (100% progress)
    const finalResult = {
      step: 5,
      progress: 100,
      status: 'complete',
      message: 'Video generation complete!',
      result: {
        status: 'complete',
        videoUrl,
        generatedImages: uploadedFiles,
        costs
      }
    };

    sendSSE(res, finalResult);
    res.end();

  } catch (error) {
    console.error('Video generation error:', error);
    
    // Send error event via SSE
    sendSSE(res, {
      status: 'error',
      message: error.message || 'An error occurred during video generation',
      error: true
    });

    // Clean up partial uploads on error
    try {
      for (const fileUrl of uploadedFiles) {
        const filename = fileUrl.split('/').pop();
        const bucket = fileUrl.includes('source-images') ? 'source-images' :
                       fileUrl.includes('enhanced-images') ? 'enhanced-images' :
                       fileUrl.includes('generated-angles') ? 'generated-angles' :
                       'generated-videos';
        
        await supabase.storage.from(bucket).remove([filename]);
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }

    res.end();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
