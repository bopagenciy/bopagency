export type SkillId = string & { readonly _brand: 'SkillId' };

export type Skill = {
  readonly id: SkillId;
  readonly name: string;
  readonly description: string;
  readonly promptPath: string;
  readonly version: string;
  readonly isEnabled: boolean;
  readonly createdAt: Date;
};
