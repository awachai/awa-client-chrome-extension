
export interface Attachment {
  type: 'image' | 'file';
  content: string;
  name: string;
  url?: string;
  fileType?: string;
}

export interface MessageAttachment {
  type: 'image' | 'file';
  content: string;
  name: string;
  url: string;
  fileType?: string;
}
