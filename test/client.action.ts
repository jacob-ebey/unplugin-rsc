export const serverAction: (() => Promise<string>) & {
  $$typeof?: symbol;
  module?: string;
  export?: string;
} = async () => {
  "use server";
  return "server";
};
