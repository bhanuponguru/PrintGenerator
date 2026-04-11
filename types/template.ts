import { ObjectId } from 'mongodb';

export type TableMode = 'row_data' | 'column_data';

export interface BaseTypeSchema {
  kind: string;
  in_placeholder: boolean;
}

export interface StringTypeSchema extends BaseTypeSchema {
  kind: 'string';
}

export interface IntegerTypeSchema extends BaseTypeSchema {
  kind: 'integer';
}

export interface ImageTypeSchema extends BaseTypeSchema {
  kind: 'image';
  option?: Record<string, unknown>;
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
  mode: TableMode;
  headers: string[];
  caption?: ComponentTypeSchema;
}

export type ComponentTypeSchema =
  | StringTypeSchema
  | IntegerTypeSchema
  | ImageTypeSchema
  | HyperlinkTypeSchema
  | ListTypeSchema
  | ContainerTypeSchema
  | TableTypeSchema;

export type PlaceholderKeyTypeMap = Record<string, ComponentTypeSchema>;

export interface ImageValue {
  in_placeholder: boolean;
  src: string;
  alt: string;
  option?: Record<string, unknown>;
}

export interface HyperlinkValue {
  in_placeholder: boolean;
  alias: string;
  url: string;
}

export interface TableRowDataValue {
  in_placeholder: boolean;
  mode: 'row_data';
  caption?: ComponentValue;
  rows: Array<Record<string, unknown>>;
}

export interface TableColumnDataValue {
  in_placeholder: boolean;
  mode: 'column_data';
  caption?: ComponentValue;
  columns: Record<string, Record<string, unknown>>;
}

export interface ContainerValue {
  in_placeholder: boolean;
  components: ComponentValue[];
}

export interface ListValue {
  in_placeholder: boolean;
  items: ComponentValue[];
}

export type PrimitiveComponentValue = string | number;

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
