// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import * as S from '../../styles/Error.styled';

const ErrorFallback = () => {
  return (
    <S.Container>
      <S.Code>Oops</S.Code>
      <S.Message>Something went wrong while showing this page.</S.Message>
      {/* A full page load is needed to reset the error boundary, so a plain anchor is used instead of next/link */}
      <S.HomeLink as="a" href="/">
        Go to homepage
      </S.HomeLink>
    </S.Container>
  );
};

export default ErrorFallback;
