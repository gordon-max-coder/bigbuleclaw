const crypto = require('crypto-js');

// Kling API configuration
const KLING_CONFIG = {
  accessKey: 'APgQ3hDtJJfEQPPfTgGHdYtKLeTfgdMg',
  secretKey: 'pnPLfK3kARgBNkEbQpJMpTykYeQYdpnL',
  baseUrl: 'https://api-singapore.klingai.com'
};

// Generate JWT token for Kling API
function generateJWTToken(accessKey, secretKey) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: accessKey,
    exp: now + 3600,
    iat: now,
    nbf: now
  };

  // Use proper base64url encoding
  const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;

  const hmac = crypto.HmacSHA256(signatureInput, secretKey);
  const signatureEncoded = hmac.toString(crypto.enc.Base64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
}

// Check video generation status - CORRECT ENDPOINT: /v1/videos/text2video/{taskId}
async function checkVideoStatus(jwtToken, taskId, mode = 'text') {
  const endpoint = mode === 'image' ? 'image2video' : 'text2video';
  const url = `${KLING_CONFIG.baseUrl}/v1/videos/${endpoint}/${taskId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${jwtToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kling status check error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { prompt, mode = 'text', style = 'anime', duration = 5, taskId, image } = req.body;

    // If taskId provided, check status
    if (taskId) {
      console.log(`Checking status for task: ${taskId}, mode: ${req.body.mode || 'text'}`);
      const jwtToken = generateJWTToken(KLING_CONFIG.accessKey, KLING_CONFIG.secretKey);
      const statusResponse = await checkVideoStatus(jwtToken, taskId, req.body.mode || 'text');

      const taskStatus = statusResponse.data?.task_status;
      console.log('Task status:', taskStatus);

      if (taskStatus === 'completed') {
        return res.json({
          success: true,
          status: 'completed',
          videoUrl: statusResponse.data?.task_result?.url || statusResponse.data?.url,
          thumbnailUrl: statusResponse.data?.task_result?.thumbnail || statusResponse.data?.thumbnail,
          taskId: taskId
        });
      } else if (taskStatus === 'failed') {
        return res.json({
          success: false,
          status: 'failed',
          error: statusResponse.data?.task_status_msg || 'Video generation failed',
          taskId: taskId
        });
      } else {
        return res.json({
          success: true,
          status: 'processing',
          taskId: taskId,
          message: taskStatus || 'Processing...'
        });
      }
    }

    // Generate new video
    if (!prompt && mode !== 'image') {
      return res.status(400).json({ error: 'Prompt is required for text-to-video' });
    }

    // For image mode, image is required
    if (mode === 'image' && !image) {
      return res.status(400).json({ error: 'Image is required for image-to-video' });
    }

    console.log(`Kling API: Generating video, mode: ${mode}, prompt: ${prompt ? prompt.substring(0, 50) : '(none)'}`);

    const jwtToken = generateJWTToken(KLING_CONFIG.accessKey, KLING_CONFIG.secretKey);
    console.log('JWT Token generated');

    let apiUrl;
    let requestBody;

    // Determine which API endpoint to call based on mode
    if (mode === 'image') {
      // Image-to-video endpoint
      apiUrl = `${KLING_CONFIG.baseUrl}/v1/videos/image2video`;
      console.log('Calling Kling Image-to-Video API:', apiUrl);

      // For image-to-video, we need to send the image as base64
      // Check if image is a URL or base64
      let imageData = image;

      if (image && image.startsWith('http')) {
        // It's a URL - use image_url field
        console.log('Using image URL:', image);
        requestBody = {
          prompt: prompt || '',
          image_url: image
        };
      } else if (image && image.includes('data:')) {
        // Remove data:image/... prefix if present
        const base64Match = image.match(/data:image\/[^;]+;base64,(.+)/);
        if (base64Match) {
          imageData = base64Match[1];
        }
        console.log('Image base64 length:', imageData ? imageData.length : 0);

        // Use 'image' field with pure base64
        requestBody = {
          prompt: prompt || '',
          image: imageData
        };
        console.log('Trying with image field:', JSON.stringify(requestBody).substring(0, 200));
      } else {
        // Assume pure base64
        console.log('Image base64 length:', imageData ? imageData.length : 0);
        requestBody = {
          prompt: prompt || '',
          image: imageData
        };
      }
    } else {
      // Text-to-video endpoint
      apiUrl = `${KLING_CONFIG.baseUrl}/v1/videos/text2video`;
      console.log('Calling Kling Text-to-Video API:', apiUrl);

      requestBody = {
        prompt: prompt
      };
    }

    let klingResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Kling API response status:', klingResponse.status);

    const responseText = await klingResponse.text();
    console.log('Kling API response:', responseText.substring(0, 500));

    // Check if rate limited or error
    if (klingResponse.status === 429 || klingResponse.status === 400) {
      const errorData = JSON.parse(responseText);
      throw new Error(`Kling API error: ${errorData.message || responseText}`);
    }

    if (!klingResponse.ok) {
      throw new Error(`Kling API error: ${klingResponse.status} - ${responseText}`);
    }

    const klingData = JSON.parse(responseText);

    // Check response structure
    const newTaskId = klingData.data?.task_id;
    const taskStatus = klingData.data?.task_status;

    if (!newTaskId) {
      throw new Error('No task_id returned from Kling API');
    }

    console.log('Task submitted, task_id:', newTaskId, 'status:', taskStatus);

    // If completed immediately, return the video
    if (taskStatus === 'completed') {
      return res.json({
        success: true,
        taskId: newTaskId,
        status: 'completed',
        videoUrl: klingData.data?.task_result?.url || klingData.data?.url,
        thumbnailUrl: klingData.data?.task_result?.thumbnail || klingData.data?.thumbnail,
        message: 'Video generated successfully'
      });
    }

    // Otherwise return task ID for polling
    return res.json({
      success: true,
      taskId: newTaskId,
      status: taskStatus || 'processing',
      message: 'Video generation started. Use taskId to poll for status.',
      requiresPolling: true
    });

  } catch (error) {
    console.error('Error:', error.message);

    // Return demo response if API fails
    const demoVideos = [
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'
    ];

    const demoThumbnails = [
      'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1280&h=720&fit=crop',
      'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=1280&h=720&fit=crop',
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1280&h=720&fit=crop'
    ];

    const idx = Math.floor(Math.random() * demoVideos.length);

    return res.json({
      success: true,
      taskId: 'demo-' + Date.now(),
      status: 'completed',
      videoUrl: demoVideos[idx],
      thumbnailUrl: demoThumbnails[idx],
      message: 'Demo mode - Kling API: ' + error.message,
      isDemo: true,
      klingError: error.message
    });
  }
};
