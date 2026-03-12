import { ObjectId } from 'mongodb';

/**
 * Template document structure in MongoDB
 */
export interface Template {
  _id: ObjectId;
  name: string;
  version: string;
  template: Record<string, any>; // Flexible JSON/BSON object
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
}

/**
 * Input type for updating an existing template
 */
export interface TemplateUpdate {
  name?: string;
  version?: string;
  template?: Record<string, any>;
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
