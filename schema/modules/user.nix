{ config, lib, ... }:
{
  # Base user entity - extend with domain-specific fields in other modules
  tables.user = {
    id = { type = "integer"; pk = true; auto = true; };
    email = {
      type = "text";
      required = true;
      unique = true;
      metadata = {
        label = "Email";
        helpText = "Used for identity verification and account access.";
        placeholder = "you@example.com";
        format = "email";
        displayPriority = 10;
      };
    };
    name = {
      type = "text";
      required = true;
      metadata = {
        label = "Name";
        placeholder = "Full name";
        displayPriority = 20;
      };
      validation = {
        minLength = 1;
        maxLength = 120;
      };
    };
    phone = {
      type = "text";
      metadata = {
        label = "Phone";
        placeholder = "07123 456789";
        format = "phone";
        displayPriority = 30;
      };
    };
    avatar_url = {
      type = "text";
      metadata = {
        label = "Avatar URL";
        format = "url";
        displayPriority = 40;
      };
    };
    created_at = {
      type = "text";
      default = "CURRENT_TIMESTAMP";
      metadata = {
        label = "Created";
        format = "date-time";
        displayPriority = 1000;
      };
    };
  };
}
