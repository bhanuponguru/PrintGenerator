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
  style?: ListStyle;
  min_items?: number;
  max_items?: number;
}

export interface ContainerTypeSchema extends BaseTypeSchema {
  kind: 'container';
  mode?: 'tuple' | 'repeat';
  component_types?: ComponentTypeSchema[];
  item_type?: ComponentTypeSchema;
  min_items?: number;
  max_items?: number;
}

export interface RepeatTypeSchema extends BaseTypeSchema {
  kind: 'repeat';
  item_type: ComponentTypeSchema;
  min_items?: number;
  max_items?: number;
  base_variable?: string;
  layout_template?: string;
}

export interface CustomLayoutTextNode {
  kind: 'text';
  value: string;
}

export interface CustomLayoutTokenNode {
  kind: 'token';
  token_id: string;
  prefix?: string;
  suffix?: string;
}

export interface CustomLayoutNewlineNode {
  kind: 'newline';
}

export type CustomLayoutNode =
  | CustomLayoutTextNode
  | CustomLayoutTokenNode
  | CustomLayoutNewlineNode;

export interface CustomTokenDefinition {
  id: string;
  label?: string;
  schema: ComponentTypeSchema;
}

export interface CustomTypeSchema extends BaseTypeSchema {
  kind: 'custom';
  base_variable: string;
  value_type: ComponentTypeSchema;
  layout_template: string;
  repeat?: boolean;
  token_registry?: Record<string, ComponentTypeSchema>;
  token_labels?: Record<string, string>;
  layout_nodes?: CustomLayoutNode[];
}

export interface PageTypeSchema extends BaseTypeSchema {
  kind: 'page';
  component_types: ComponentTypeSchema[];
}

export interface HeaderTypeSchema extends BaseTypeSchema {
  kind: 'header';
  component_types: ComponentTypeSchema[];
}

export interface FooterTypeSchema extends BaseTypeSchema {
  kind: 'footer';
  component_types: ComponentTypeSchema[];
}

export interface PageBreakTypeSchema extends BaseTypeSchema {
  kind: 'page_break';
}

export interface TableTypeSchema extends BaseTypeSchema {
  kind: 'table';
  mode?: TableMode;
  headers?: string[];
  dynamic_headers?: boolean;
  column_types?: Record<string, ComponentTypeSchema>;
  row_types?: Record<string, ComponentTypeSchema>;
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
  | RepeatTypeSchema
  | CustomTypeSchema
  | PageTypeSchema
  | HeaderTypeSchema
  | FooterTypeSchema
  | PageBreakTypeSchema
  | TableTypeSchema;

/** Maps each placeholder key to the schema expected for its value. */
export type PlaceholderKeyTypeMap = Record<string, ComponentTypeSchema>;

/** Payload for image placeholders. */
export interface ImageValue {
  src: string;
  alt: string;
  source?: 'url' | 'file';
  mime_type?: string;
  file_name?: string;
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

export interface PageValue {
  components: ComponentValue[];
}

export interface HeaderValue {
  components: ComponentValue[];
}

export interface FooterValue {
  components: ComponentValue[];
}

/** Composite payload for list placeholders. */
export interface ListValue {
  items: ComponentValue[];
  style?: ListStyle;
}

export interface RepeatValue {
  items: ComponentValue[];
}

export interface CustomValue {
  data: unknown;
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
  | RepeatValue
  | CustomValue
  | PageValue
  | HeaderValue
  | FooterValue
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
