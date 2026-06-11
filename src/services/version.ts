const version = (data: Record<string, any> = {}) => ({
  app: 1,
  data: { ...data },
})

export default version
