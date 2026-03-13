{...}: {
  tables.customer = {
    id = {
      type = "integer";
      pk = true;
      auto = true;
    };
    name = {
      type = "text";
      required = true;
    };
    email = {
      type = "text";
      unique = true;
    };
    phone = {type = "text";};
    created_at = {
      type = "text";
      default = "CURRENT_TIMESTAMP";
    };
  };
}
