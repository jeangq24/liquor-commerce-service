export interface CommerceActor {
  readonly id: string;
  readonly permissions: readonly string[];
}

export interface CommerceRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  commerceActor?: CommerceActor;
}
