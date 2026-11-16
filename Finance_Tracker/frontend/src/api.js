import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshing = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error
    const refreshToken = localStorage.getItem('refresh')

    if (
      response?.status !== 401 ||
      !refreshToken ||
      !config ||
      config._retried ||
      config.url?.endsWith('/token/refresh/')
    ) {
      return Promise.reject(error)
    }

    try {
      refreshing =
        refreshing ||
        axios
          .post('/api/token/refresh/', { refresh: refreshToken })
          .then((res) => {
            localStorage.setItem('access', res.data.access)
            return res.data.access
          })
          .finally(() => {
            refreshing = null
          })

      const access = await refreshing
      config._retried = true
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${access}`
      return api(config)
    } catch {
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
      return Promise.reject(error)
    }
  },
)

export default api
