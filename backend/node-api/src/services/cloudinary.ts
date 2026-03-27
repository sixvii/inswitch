/// <reference types="node" />
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

const hasCloudinaryConfig =
  !!env.CLOUDINARY_CLOUD_NAME && !!env.CLOUDINARY_API_KEY && !!env.CLOUDINARY_API_SECRET;

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const uploadProfileImageToCloudinary = async (fileBuffer: Buffer, userId: string): Promise<string> => {
  if (!hasCloudinaryConfig) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: env.CLOUDINARY_FOLDER,
        public_id: userId,
        overwrite: true,
        resource_type: 'image',
        transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }],
      },
      (error, result) => {
        if (error || !result?.secure_url) {
          reject(error || new Error('Cloudinary upload failed'));
          return;
        }

        resolve(result.secure_url);
      },
    );

    uploadStream.end(fileBuffer);
  });
};
