package customer

Customer :: struct {
	id:         i64 `json:"id"`,
	name:       string `json:"name"`,
	email:      string `json:"email"`,
	phone:      string `json:"phone"`,
	created_at: string `json:"created_at"`,
}

// Input struct for create/update (no id or created_at)
Customer_Input :: struct {
	name:  string `json:"name"`,
	email: string `json:"email"`,
	phone: string `json:"phone"`,
}
