export type UserId = string & { readonly _brand: 'UserId' };

export type User = {
  readonly id: UserId;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
