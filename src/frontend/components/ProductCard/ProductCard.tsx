// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { CypressFields } from '../../utils/enums/CypressFields';
import { Product } from '../../protos/demo';
import ProductPrice from '../ProductPrice';
import * as S from './ProductCard.styled';
import { useState, useEffect } from 'react';
import { useNumberFlagValue } from '@openfeature/react-sdk';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { addBreadcrumb, logWarning } from '../../utils/telemetry/Telemetry';

interface IProps {
  product: Product;
  source?: 'product_list' | 'recommendations';
}

async function getImageWithHeaders(requestInfo: Request) {
  const res = await fetch(requestInfo);
  return await res.blob();
}

const ProductCard = ({
  product: {
    id,
    picture,
    name,
    priceUsd = {
      currencyCode: 'USD',
      units: 0,
      nanos: 0,
    },
  },
  source = 'product_list',
}: IProps) => {
  const imageSlowLoad = useNumberFlagValue('imageSlowLoad', 0);
  const [imageSrc, setImageSrc] = useState<string>('');

  useEffect(() => {
    if (!picture) {
      setImageSrc('');
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    let cancelled = false;
    const headers = new Headers();
    headers.append('x-envoy-fault-delay-request', imageSlowLoad.toString());
    headers.append('Cache-Control', 'no-cache');
    const requestInit = {
      method: 'GET',
      headers: headers,
      signal: controller.signal,
    };
    const imageUrl = '/images/products/' + picture;
    const requestInfo = new Request(imageUrl, requestInit);
    getImageWithHeaders(requestInfo)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageSrc(objectUrl);
      })
      .catch(err => {
        if (!cancelled && err.name !== 'AbortError') {
          logWarning('Product image failed to load', { 'demo.product.id': id, [ATTR_ERROR_TYPE]: err.name });
          setImageSrc('');
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, imageSlowLoad, picture]);

  return (
    <S.Link
      href={`/product/${id}`}
      onClick={() => addBreadcrumb(`Tapped ${source === 'recommendations' ? 'recommended ' : ''}product ${name} (${id})`)}
    >
      <S.ProductCard data-cy={CypressFields.ProductCard}>
        <S.Image $src={imageSrc} />
        <div>
          <S.ProductName>{name}</S.ProductName>
          <S.ProductPrice>
            <ProductPrice price={priceUsd} />
          </S.ProductPrice>
        </div>
      </S.ProductCard>
    </S.Link>
  );
};

export default ProductCard;
