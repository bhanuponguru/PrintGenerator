import { ObjectId } from 'mongodb';

/** Shared template and placeholder typing used across the app. */
export type TableMode = 'row_data' | 'column_data';
export type ListStyle = 'bulleted' | 'numbered' | 'plain';

/** Base schema discriminant for all placeholder value types. */
export interface BaseTypeSchema {
  kind: string;
}

export interface StringTypeSchema extends BaseTypeSchema {
  kind: 'string';
}

export interface IntegerTypeSchema extends BaseTypeSchema {
  kind: 'integer';
}

export interface ImageTypeSchema extends BaseTypeSchema {
  kind: 'image';
}

export interface HyperlinkTypeSchema extends BaseTypeSchema {
  kind: 'hyperlink';
}

export interface ListTypeSchema extends BaseTypeSchema {
  kind: 'list';
  item_type: ComponentTypeSchema;
}

export interface ContainerTypeSchema extends BaseTypeSchema {
  kind: 'container';
  component_types: ComponentTypeSchema[];
}

export interface TableTypeSchema extends BaseTypeSchema {
  kind: 'table';
  caption?: ComponentTypeSchema;
}

/** Union of every placeholder schema supported by the editor and backend. */
export type ComponentTypeSchema =
  | StringTypeSchema
  | IntegerTypeSchema
  | ImageTypeSchema
  | HyperlinkTypeSchema
  | ListTypeSchema
  | ContainerTypeSchema
  | TableTypeSchema;

/** Maps each placeholder key to the schema expected for its value. */
export type PlaceholderKeyTypeMap = Record<string, ComponentTypeSchema>;

/** Payload for image placeholders. */
export interface ImageValue {
  src: string;
  alt: string;
}

/** Payload for hyperlink placeholders. */
export interface HyperlinkValue {
  alias: string;
  url: string;
}

/** Row-based table payload. */
export interface TableRowDataValue {
  caption?: ComponentValue;
  rows: Array<Record<string, unknown>>;
}

/** Column-based table payload. */
export interface TableColumnDataValue {
  caption?: ComponentValue;
  columns: Record<string, Record<string, unknown>>;
}

/** Composite payload for container placeholders. */
export interface ContainerValue {
  components: ComponentValue[];
}

/** Composite payload for list placeholders. */
export interface ListValue {
  items: ComponentValue[];
}

/** Primitive values that can appear inside typed composite payloads. */
export type PrimitiveComponentValue = string | number;

/** Any supported value that a placeholder can carry. */
export type ComponentValue =
  | PrimitiveComponentValue
  | ImageValue
  | HyperlinkValue
  | ListValue
  | ContainerValue
  | TableRowDataValue
  | TableColumnDataValue;

/**
 * Template document structure in MongoDB
 */
export interface Template {
  _id: ObjectId;
  name: string;
  version: string;
  template: Record<string, any>; // ProseMirror/Tiptap JSON document
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
