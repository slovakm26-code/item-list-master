/**
 * Image utilities for compression and optimization
 * Reduces storage usage while maintaining visual quality
 */

export interface ImageCompressionOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number; // 0-1
  format: 'jpeg' | 'webp' | 'png';
}

const DEFAULT_THUMBNAIL_OPTIONS: ImageCompressionOptions = {
  maxWidth: 300,
  maxHeight: 450,
  quality: 0.8,
  format: 'jpeg',
};

const DEFAULT_COVER_OPTIONS: ImageCompressionOptions = {
  maxWidth: 600,
  maxHeight: 900,
  quality: 0.85,
  format: 'jpeg',
};

/**
 * Compress an image file to reduce storage size
 */
export const compressImage = async (
  file: File | Blob,
  options: Partial<ImageCompressionOptions> = {}
): Promise<string> => {
  const opts = { ...DEFAULT_COVER_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;
      
      if (width > opts.maxWidth) {
        height = (height * opts.maxWidth) / width;
        width = opts.maxWidth;
      }
      
      if (height > opts.maxHeight) {
        width = (width * opts.maxHeight) / height;
        height = opts.maxHeight;
      }
      
      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Use better quality interpolation
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to desired format
      const mimeType = `image/${opts.format}`;
      const dataUrl = canvas.toDataURL(mimeType, opts.quality);
      
      resolve(dataUrl);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
};

/**
 * Create a thumbnail from an image
 */
export const createThumbnail = async (
  file: File | Blob,
  options: Partial<ImageCompressionOptions> = {}
): Promise<string> => {
  return compressImage(file, { ...DEFAULT_THUMBNAIL_OPTIONS, ...options });
};

/**
 * Compress an existing base64 image
 */
export const compressBase64Image = async (
  base64: string,
  options: Partial<ImageCompressionOptions> = {}
): Promise<string> => {
  // Convert base64 to blob
  const response = await fetch(base64);
  const blob = await response.blob();
  return compressImage(blob, options);
};

/**
 * Estimate the size of a base64 string in bytes
 */
export const estimateBase64Size = (base64: string): number => {
  // Remove data URL prefix if present
  const data = base64.includes(',') ? base64.split(',')[1] : base64;
  // Base64 encoding increases size by ~33%
  return Math.ceil((data.length * 3) / 4);
};

/**
 * Format bytes to human readable string
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Check if a string is a valid base64 image
 */
export const isBase64Image = (str: string): boolean => {
  return str.startsWith('data:image/');
};

/**
 * Get image dimensions from base64
 */
export const getImageDimensions = async (
  base64: string
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = base64;
  });
};
