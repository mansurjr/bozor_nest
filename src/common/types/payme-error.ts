export const PaymeError = {
  InvalidAmount: {
    name: 'InvalidAmount',
    code: -31001,
    message: {
      uz: "Noto'g'ri summa",
      ru: 'Недопустимая сумма',
      en: 'Invalid amount',
    },
  },
  UserNotFound: {
    name: 'UserNotFound',
    code: -31050,
    message: {
      uz: 'Biz sizning hisobingizni topolmadik.',
      ru: 'Мы не нашли вашу учетную запись',
      en: "We couldn't find your account",
    },
  },
  ProductNotFound: {
    name: 'ProductNotFound',
    code: -31050,
    message: {
      uz: 'Biz mahsulotni topolmadik.',
      ru: 'Нам не удалось найти товар.',
      en: 'We could not find the product.',
    },
  },
  CantDoOperation: {
    name: 'CantDoOperation',
    code: -31008,
    message: {
      uz: 'Biz operatsiyani bajara olmaymiz',
      ru: 'Мы не можем сделать операцию',
      en: "We can't do operation",
    },
  },
  TransactionNotFound: {
    name: 'TransactionNotFound',
    code: -31003,
    message: {
      uz: 'Tranzaktsiya topilmadi',
      ru: 'Транзакция не найдена',
      en: 'Transaction not found',
    },
  },
  AlreadyDone: {
    name: 'AlreadyDone',
    code: -31060,
    message: {
      uz: "Bu uchun to'lov qilib bo'lingan yoki status aktiv emas.",
      ru: 'Оплата за это не проведена или статус неактивен.',
      en: 'Already paid for this or status is not active',
    },
  },
  Pending: {
    name: 'Pending',
    code: -31050,
    message: {
      uz: "Mahsulot uchun to'lov kutilayapti",
      ru: 'Ожидается оплата товар',
      en: 'Payment for the product is pending',
    },
  },
  InvalidAuthorization: {
    name: 'InvalidAuthorization',
    code: -32504,
    message: {
      uz: 'Avtorizatsiya yaroqsiz',
      ru: 'Авторизация недействительна',
      en: 'Authorization invalid',
    },
  },
};
