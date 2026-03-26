export type LoginUser = {
  user_id: string;
  name: string;
};

export type LoginResponse = {
  ok: boolean;
  user: LoginUser;
};

export type UsersWarehouseResp = {
  ok: boolean;
  users: {
    id: number;
    name: string;
    correo: string;
  }[];
};
