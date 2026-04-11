import { ObjectId } from 'mongodb';

/**
 * Template document structure in MongoDB
 */
export interface Template {
  _id: ObjectId;
  name: string;
  version: string;
  template: Record<string, any>; // Flexible JSON/BSON object
  tag_ids?: ObjectId[]; // Internal MongoDB ObjectId references linking to associated Tags
  created_on: Date;
  updated_on: Date;
}

/**
 * Input type for creating a new template
 */
export interface TemplateInput {
  name: string;
  version: string;
  template: Record<string, any>;
  tag_ids?: string[]; // Array of Tag ObjectIds passed as strings from the client
}

/**
 * Input type for updating an existing template
 */
export interface TemplateUpdate {
  name?: string;
  version?: string;
  template?: Record<string, any>;
  tag_ids?: string[]; // Array of Tag ObjectIds passed as strings from the client
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
