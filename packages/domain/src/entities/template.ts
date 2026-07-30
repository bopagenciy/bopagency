export type TemplateId = string & { readonly _brand: 'TemplateId' };

export type TemplateType = 'report' | 'email' | 'campaign_brief' | 'ad_copy' | 'custom';

export type Template = {
  readonly id: TemplateId;
  readonly name: string;
  readonly type: TemplateType;
  readonly content: string;
  readonly variables: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
