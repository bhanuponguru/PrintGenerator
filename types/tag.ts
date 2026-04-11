import { ObjectId } from 'mongodb';

/**
 * Tag document structure in MongoDB
 * @property {ObjectId} _id - Unique identifier for the tag
 * @property {string} name - Human readable unique name for the tag
 * @property {ObjectId[]} template_ids - Array of associated template ObjectIds 
 */
export interface Tag {
  _id: ObjectId;
  name: string;
  template_ids: ObjectId[];
}

/**
 * Input type for creating a new tag via POST /tags 
 */
export interface TagCreateInput {
  name: string;
}

/**
 * Input type for updating an existing tag via PATCH /tags
 */
export interface TagUpdateInput {
  old_name: string;
  new_name: string;
}

/**
 * API Response format for a Tag sent to the client
 */
export interface TagResponse {
  _id: string;
  name: string;
  template_ids: string[];
  created_on: string;
}
