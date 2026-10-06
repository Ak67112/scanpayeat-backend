import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

// Configure Cloudinary
if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

// Multer in-memory storage (up to 5MB images)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  },
});

export async function uploadImageToStorage(
  buffer: Buffer,
  filename: string,
  folder = 'scanpayeat/products'
): Promise<string> {
  // If Cloudinary credentials are fully configured, upload directly
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, public_id: filename.replace(/\.[^/.]+$/, '') },
        (error, result) => {
          if (error) return reject(error);
          resolve(result?.secure_url || result?.url || '');
        }
      );
      uploadStream.end(buffer);
    });
  }

  // Fallback for local development/testing without Cloudinary credentials:
  // Return a mock placeholder CDN URL with unique id
  const mockId = Math.random().toString(36).substring(2, 9);
  return `https://res.cloudinary.com/demo/image/upload/v1/${folder}/${mockId}_${filename}`;
}
