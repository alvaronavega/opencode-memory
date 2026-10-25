export type WiringContext = any

export async function setup(ctx: WiringContext): Promise<void> {
  await ctx.command.transform((editor: any) => {
    editor.add({ name: "mem", description: "memoria", execute: async () => {} })
  })
}
