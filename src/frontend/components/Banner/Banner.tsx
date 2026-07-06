// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useNumberFlagValue } from '@openfeature/react-sdk';
import * as S from './Banner.styled';

async function getImageWithHeaders(requestInfo: Request) {
  const res = await fetch(requestInfo);
  return await res.blob();
}

const Banner = () => {
  const imageSlowLoad = useNumberFlagValue('imageSlowLoad', 0);
  const [imageSrc, setImageSrc] = useState<string>('');

  useEffect(() => {
    const headers = new Headers();
    headers.append('x-envoy-fault-delay-request', imageSlowLoad.toString());
    headers.append('Cache-Control', 'no-cache');
    const requestInit = {
      method: "GET",
      headers: headers
      };
    const image_url = '/images/Banner.png';
    const requestInfo = new Request(image_url, requestInit);
    getImageWithHeaders(requestInfo).then(blob => {
      setImageSrc(URL.createObjectURL(blob));
      });
   }, [imageSlowLoad]);

  return (
     <S.Banner>
       <S.ImageContainer>
         <S.BannerImg src={imageSrc} />
       </S.ImageContainer>
       <S.TextContainer>
         <S.Title>The best telescopes to see the world closer</S.Title>
         <Link href="#hot-products"><S.GoShoppingButton>Go Shopping</S.GoShoppingButton></Link>
       </S.TextContainer>
     </S.Banner>
   );
};

export default Banner;
