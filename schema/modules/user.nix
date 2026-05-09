{ config, lib, ... }:
{
  # Base user entity - extend with domain-specific fields in other modules
  tables.user = {
    id = { type = "integer"; pk = true; auto = true; };
    email = { type = "text"; required = true; unique = true; };
    name = { type = "text"; required = true; };
    phone = { type = "text"; };
    avatar_url = { type = "text"; };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };
}
