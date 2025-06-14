
import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'ai' | 'debug';
  content: string;
  timestamp: Date;
  imageUrl?: string;
  attachments?: Array<{
    type: 'image' | 'file';
    content: string;
    name: string;
    url: string;
    fileType?: string;
  }>;
}

interface ImageNavigationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl: string;
  currentImageName?: string;
  messages: Message[];
  currentMessageId: string;
  currentAttachmentIndex?: number;
}

export const ImageNavigationDialog: React.FC<ImageNavigationDialogProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  currentImageName,
  messages,
  currentMessageId,
  currentAttachmentIndex
}) => {
  // Get all images from messages
  const getAllImages = () => {
    const images: Array<{
      url: string;
      name: string;
      messageId: string;
      attachmentIndex?: number;
    }> = [];

    messages.forEach(message => {
      // Add main image if exists
      if (message.imageUrl) {
        images.push({
          url: message.imageUrl,
          name: 'Generated image',
          messageId: message.id
        });
      }

      // Add attachment images
      if (message.attachments) {
        message.attachments.forEach((attachment, index) => {
          if (attachment.type === 'image' && attachment.url) {
            images.push({
              url: attachment.url,
              name: attachment.name,
              messageId: message.id,
              attachmentIndex: index
            });
          }
        });
      }
    });

    return images;
  };

  const allImages = getAllImages();
  
  // Find current image index
  const currentIndex = allImages.findIndex(img => 
    img.messageId === currentMessageId && 
    (currentAttachmentIndex !== undefined ? img.attachmentIndex === currentAttachmentIndex : img.attachmentIndex === undefined)
  );

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < allImages.length - 1;

  const handlePrevious = () => {
    if (canGoPrevious) {
      const prevImage = allImages[currentIndex - 1];
      // You would need to update the parent component to handle this navigation
      // For now, we'll just close and let the parent handle it
      onClose();
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      const nextImage = allImages[currentIndex + 1];
      // You would need to update the parent component to handle this navigation
      // For now, we'll just close and let the parent handle it
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] p-0 bg-black/90">
        <div className="relative">
          {/* Close button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Navigation buttons */}
          {canGoPrevious && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}

          {canGoNext && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}

          {/* Image */}
          <img 
            src={currentImageUrl} 
            alt={currentImageName || 'Image'}
            className="w-full h-auto max-h-[75vh] object-contain"
            onError={(e) => {
              console.error('Image load error:', currentImageName);
            }}
          />

          {/* Image info */}
          <div className="absolute bottom-4 left-4 right-4 text-center">
            <div className="bg-black/50 text-white px-3 py-1 rounded-full text-sm">
              {currentImageName} ({currentIndex + 1} / {allImages.length})
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
