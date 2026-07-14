import { api } from './client'
import type { SurveyTemplate } from './types'

export const surveyTemplatesApi = {
  list: () => api.get<SurveyTemplate[]>('/v1/org/survey-templates'),
}
