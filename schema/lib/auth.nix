# Authorization policy helpers.
#
# Platform principals are intentionally small and stable:
# - anonymous: unauthenticated public actor
# - user: authenticated human identity
# - customer: external/end-user identity
# - staff: internal/operator identity
# - admin: elevated operator
# - service: machine/API-key actor
# - owner: policy pseudo-principal resolved against a concrete record
#
# Generated auth contexts may contain every principal except owner. Owner is
# represented by `owner = true` rules so policy can compare configured owner
# fields with `auth.userId`.

{
  principals = values: { principals = values; };
  roles = values: { roles = values; };
  scopes = values: { scopes = values; };
  owner = { owner = true; };
  ownerFields = fields: { owner = true; ownerFields = fields; };

  public = { principals = [ "anonymous" ]; };
  user = { principals = [ "user" "customer" ]; };
  operator = { principals = [ "admin" "staff" ]; };
  service = { principals = [ "service" ]; };
  admin = { principals = [ "admin" ]; };
  ownerUser = { principals = [ "user" "customer" ]; owner = true; };
  ownerService = scopes: { principals = [ "service" ]; owner = true; scopes = scopes ++ [ "*" ]; };

  scoped = scope: { scopes = [ scope "*" ]; };
  scopedAny = scopes: { scopes = scopes ++ [ "*" ]; };
}
