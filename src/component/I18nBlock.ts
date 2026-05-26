import { HeadComponent } from 'mjml-core'

export default class I18nBlock extends HeadComponent {
    static componentName = 'i18n';

    static allowedAttributes = { type: 'string' }
}